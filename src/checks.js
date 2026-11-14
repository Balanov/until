import { spawn } from "node:child_process";
import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { assertCheck } from "./policy.js";
import { resolveInside, sha256 } from "./util.js";

const MAX_ARTIFACT_BYTES = 10_000_000;
const MAX_COMMAND_OUTPUT = 1_000_000;

/**
 * Condenses a command's output down to what actually failed.
 *
 * A test suite prints a line per passing test. Handing that whole log back to a
 * builder buries the two lines that matter under thousands of characters of noise.
 * The raw output stays in the evidence; this is the part that goes into feedback.
 */
export function summarizeFailures(output, limit = 4_000) {
  const lines = String(output ?? '').split('\n');
  // Case-sensitive on purpose: "a failed repair restores..." is a passing test.
  const failure = /✖|✗|not ok|AssertionError|Error:|expected:|actual:|operator:|failing tests:|# fail|# pass|FAIL\b|ℹ (tests|pass|fail)\b/;
  const picked = lines.filter((line) => failure.test(line));
  const text = picked.length ? picked.join('\n') : lines.slice(-25).join('\n');
  return text.length > limit ? `${text.slice(0, limit)}\n[truncated]` : text;
}

/**
 * Keeps the end of a command's output.
 *
 * A failing check reports the interesting part last — the assertion diff and the
 * summary of what failed. Truncating from the head throws exactly that away, so
 * the builder is told "something went wrong" and nothing more.
 */
export function tailOutput(output, limit = MAX_COMMAND_OUTPUT) {
  const text = String(output ?? '');
  if (text.length <= limit) return text;
  return `[...${text.length - limit} characters truncated...]\n${text.slice(-limit)}`;
}

// Windows cannot execute .cmd/.bat directly without a shell (Node >= 18.20 refuses it).
// Operator-registered profiles are the only thing that reaches this path, and every
// character is checked against a conservative allowlist before cmd.exe is involved.
const WINDOWS_SHELL_SAFE = /^[A-Za-z0-9_\-./=:@,+~ ]+$/;

export function resolveInvocation(command, args) {
  if (typeof command !== "string" || !command.trim()) throw new Error("Command profile requires a command");
  if (!Array.isArray(args)) throw new Error("Command profile requires an args array");
  if (args.some((item) => typeof item !== "string")) throw new Error("Command args must be strings");
  const isWindowsShellScript = process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
  if (!isWindowsShellScript) return { command, args, shell: false };
  const line = [command, ...args].join(" ");
  if (!WINDOWS_SHELL_SAFE.test(line)) {
    throw new Error(`Command profile is not allowed to run through the Windows shell: ${line}`);
  }
  return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", line], shell: false };
}

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

function evaluateExpectation(expect, content, exitCode = 0) {
  if (!expect || typeof expect !== "object") throw new Error("Command check requires an output expectation");
  if (typeof expect.contains === "string") {
    return { passed: content.includes(expect.contains), evidence: { expectedSubstring: expect.contains } };
  }
  if (expect.jsonField && typeof expect.jsonField.field === "string" && "equals" in expect.jsonField) {
    const document = JSON.parse(content);
    const actual = fieldValue(document, expect.jsonField.field);
    return { passed: actual === expect.jsonField.equals, evidence: { actual, expected: expect.jsonField.equals } };
  }
  if (Number.isInteger(expect.exitCode)) {
    return { passed: exitCode === expect.exitCode, evidence: { exitCode, expectedExitCode: expect.exitCode } };
  }
  throw new Error("Command expectation must use contains, jsonField or exitCode");
}

function spawnProfile(profile, { cwd, env, args, timeoutMs, maxOutputBytes = MAX_COMMAND_OUTPUT }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 300_000) throw new Error("Invalid check timeout");
  const invocation = resolveInvocation(profile.command, args);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env,
      shell: invocation.shell,
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
      // Keep reading instead of killing the child: a chatty suite must still be
      // allowed to finish and report its result.
      if (output.length < maxOutputBytes * 4) output += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code, signal) => finish(resolve, { code, signal, output: tailOutput(output, maxOutputBytes) }));
    const timer = setTimeout(() => {
      child.kill();
      finish(reject, new Error("Command check timed out"));
    }, timeoutMs);
  });
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
  return spawnProfile(profile, { cwd, env, args, timeoutMs });
}

/**
 * Runs an operator-registered command profile in the workspace without requiring a
 * file-backed artifact. Used by the repair loop to decide whether an applied change
 * actually passes the project's own checks.
 */
export async function runCommandProfile(profile, { workspace, cwd = null, timeoutMs = null } = {}) {
  if (!profile || typeof profile.command !== "string" || !Array.isArray(profile.args)) {
    throw new Error("Invalid command profile");
  }
  const root = await realpath(path.resolve(workspace));
  const workdir = cwd ? await existingSafeDirectory(root, cwd) : root;
  const env = {
    PATH: process.env.PATH ?? "",
    ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot ?? "C:\\Windows" } : {}),
    ...(profile.env ?? {}),
    UNTIL_WORKSPACE: root,
  };
  const result = await spawnProfile(profile, {
    cwd: workdir,
    env,
    args: profile.args,
    timeoutMs: timeoutMs ?? profile.timeoutMs ?? 60_000,
  });
  return { ...result, output: result.output.trim(), passed: result.code === 0, failures: summarizeFailures(result.output) };
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
      const expectedExitCode = Number.isInteger(check.expect?.exitCode) ? check.expect.exitCode : 0;
      if (result.code !== expectedExitCode) {
        return { type: check.type, passed: false, evidence: { exitCode: result.code, expectedExitCode, signal: result.signal } };
      }
      const expectation = evaluateExpectation(check.expect, result.output.trim(), result.code);
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
