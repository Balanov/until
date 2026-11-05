import { spawn } from "node:child_process";
import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { assertCheck } from "./policy.js";
import { resolveInside, sha256 } from "./util.js";

const MAX_ARTIFACT_BYTES = 10_000_000;
const MAX_COMMAND_OUTPUT = 1_000_000;

async function existingFile(root, candidate) {
  const lexical = resolveInside(root, candidate);
  const [realRoot, realFile] = await Promise.all([realpath(path.resolve(root)), realpath(lexical)]);
  const relative = path.relative(realRoot, realFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Artifact symlink escapes workspace");
  }
  const info = await stat(realFile);
  if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) throw new Error("Artifact is not a bounded regular file");
  return realFile;
}

async function artifactSource(artifact, workspace) {
  if (artifact.path) {
    const file = await existingFile(workspace, artifact.path);
    return { file, content: await readFile(file, "utf8") };
  }
  if (typeof artifact.content === "string") return { file: null, content: artifact.content };
  throw new Error("Artifact has no readable content");
}

function fieldValue(document, field) {
  if (!field) return document;
  return field.split(".").reduce((value, key) => value == null ? undefined : value[key], document);
}

function evaluateExpectation(expect, content) {
  if (!expect || typeof expect !== "object") throw new Error("Command check requires an output expectation");
  if (typeof expect.contains === "string") {
    return { passed: content.includes(expect.contains), evidence: { expectedSubstring: expect.contains } };
  }
  if (expect.jsonField && typeof expect.jsonField.field === "string" && "equals" in expect.jsonField) {
    const document = JSON.parse(content);
    const actual = fieldValue(document, expect.jsonField.field);
    return { passed: actual === expect.jsonField.equals, evidence: { actual, expected: expect.jsonField.equals } };
  }
  throw new Error("Command expectation must use contains or jsonField");
}

async function runProfile(profile, artifact, workspace) {
  if (!profile || typeof profile.command !== "string" || !Array.isArray(profile.args)) {
    throw new Error("Invalid command profile");
  }
  const source = await artifactSource(artifact, workspace);
  if (!source.file) throw new Error("Command checks require a file-backed artifact");
  const replace = (value) => value.replaceAll("{artifact}", source.file).replaceAll("{workspace}", path.resolve(workspace));
  const args = profile.args.map((item) => {
    if (typeof item !== "string") throw new Error("Command args must be strings");
    return replace(item);
  });
  const cwd = profile.cwd ? await existingSafeDirectory(workspace, profile.cwd) : await realpath(path.resolve(workspace));
  const env = {
    PATH: process.env.PATH ?? "",
    ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot ?? "C:\\Windows" } : {}),
    ...(profile.env ?? {}),
    UNTIL_ARTIFACT: source.file,
    UNTIL_WORKSPACE: path.resolve(workspace),
  };
  const timeoutMs = profile.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000) throw new Error("Invalid check timeout");
  return new Promise((resolve, reject) => {
    const child = spawn(profile.command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const collect = (chunk) => {
      if (output.length < MAX_COMMAND_OUTPUT) output += chunk.toString("utf8");
      if (output.length > MAX_COMMAND_OUTPUT) child.kill();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code, signal) => finish(resolve, { code, signal, output: output.slice(0, MAX_COMMAND_OUTPUT) }));
    const timer = setTimeout(() => {
      child.kill();
      finish(reject, new Error("Command check timed out"));
    }, timeoutMs);
  });
}

async function existingSafeDirectory(root, candidate) {
  const directory = resolveInside(root, candidate);
  const [realRoot, realDirectory] = await Promise.all([realpath(path.resolve(root)), realpath(directory)]);
  const relative = path.relative(realRoot, realDirectory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Command cwd escapes workspace");
  return realDirectory;
}

export async function executeCheck(check, { artifact, workspace, commandProfiles = {} }) {
  assertCheck(check);
  try {
    if (check.type === "command_profile") {
      const profile = commandProfiles[check.profile];
      if (!profile) throw new Error(`Unknown command profile: ${check.profile}`);
      const result = await runProfile(profile, artifact, workspace);
      if (result.code !== 0) return { type: check.type, passed: false, evidence: { exitCode: result.code, signal: result.signal } };
      const expectation = evaluateExpectation(check.expect, result.output.trim());
      return { type: check.type, passed: expectation.passed, evidence: expectation.evidence };
    }
    if (check.type === "file_exists") {
      const candidate = check.path ?? artifact.path;
      if (!candidate) return { type: check.type, passed: false, evidence: { reason: "path_missing" } };
      const file = await existingFile(workspace, candidate);
      return { type: check.type, passed: true, evidence: { file: path.basename(file) } };
    }
    const source = await artifactSource(artifact, workspace);
    if (check.type === "sha256") {
      const actual = sha256(source.content);
      return { type: check.type, passed: actual === check.hash.toLowerCase(), evidence: { actual } };
    }
    if (check.type === "contains") {
      return { type: check.type, passed: source.content.includes(check.text), evidence: { expectedSubstring: check.text } };
    }
    if (check.type === "json_field") {
      const document = JSON.parse(source.content);
      const actual = fieldValue(document, check.field);
      return { type: check.type, passed: actual === check.equals, evidence: { actual, expected: check.equals } };
    }
    throw new Error(`Unsupported check: ${check.type}`);
  } catch (error) {
    return { type: check.type, passed: false, evidence: { error: error.message.slice(0, 1000) } };
  }
}

export async function runChecks(checks, context) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return { passed: false, results: [{ type: "acceptance_contract", passed: false, evidence: { reason: "checks_empty" } }] };
  }
  const results = [];
  for (const check of checks) results.push(await executeCheck(check, context));
  return { passed: results.every((result) => result.passed), results };
}
