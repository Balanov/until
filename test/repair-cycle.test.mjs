import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, rm } from "node:fs/promises";
import { runtime, goal, signal, file, nodeBinary } from "./helpers.mjs";

const brokenSource = `export function activationSteps() {
  return ["account", "duplicate-entry", "duplicate-entry", "profile"];
}
`;
const acceptedSource = `export function activationSteps() {
  return ["account", "profile"];
}
`;
const verifier = `import assert from "node:assert/strict";
import { activationSteps } from "../src/activation.js";
assert.deepEqual(activationSteps(), ["account", "profile"]);
console.log("ACTIVATION_TEST_OK");
`;

// A builder that behaves like a real coding agent: it sees the failed check and
// tries a different fix on the next attempt.
const selfRepairingBuilder = `import { writeFile } from "node:fs/promises";
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
  const payload = JSON.parse(input);
  const attempt = payload.attempt ?? 1;
  const broken = ${JSON.stringify(brokenSource)};
  const fixed = ${JSON.stringify(acceptedSource)};
  await writeFile("src/activation.js", attempt === 1 ? broken : fixed, "utf8");
  process.stdout.write(JSON.stringify({
    type: "repository_change",
    summary: attempt === 1 ? "Removed one duplicate step" : "Removed the remaining duplicate step",
    repositoryChange: true,
  }));
});
`;

// A builder that uses the v2 protocol: it returns edits and the engine applies them.
const editReturningBuilder = `import { readFile } from "node:fs/promises";
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
  const payload = JSON.parse(input);
  const current = await readFile("src/activation.js", "utf8");
  const next = current.replace('"duplicate-entry", "duplicate-entry", ', "");
  process.stdout.write(JSON.stringify({
    status: "done",
    notes: "Removed the duplicate activation step",
    edits: [{ path: "src/activation.js", content: next }],
  }));
});
`;

async function builderScript(t, source) {
  const builderPath = path.join(process.cwd(), ".until", `repair-builder-${Math.random().toString(16).slice(2)}.mjs`);
  await file(process.cwd(), path.join(".until", path.basename(builderPath)), source);
  t.after(async () => { await rm(builderPath, { force: true }); });
  return builderPath;
}

async function prepareWorkspace(t, builderSource) {
  const builderPath = await builderScript(t, builderSource);
  const context = await runtime(t, {
    builder: { command: nodeBinary, args: [builderPath], timeoutMs: 30_000 },
    sandboxConfirmed: true,
    checks: {
      repositoryTest: { command: nodeBinary, args: ["scripts/verify.mjs"], timeoutMs: 30_000 },
    },
  });
  await file(context.workspace, "src/activation.js", brokenSource);
  await file(context.workspace, "scripts/verify.mjs", verifier);
  goal(context.store, {
    policy: {
      acceptance: [
        { type: "file_exists", path: "src/activation.js" },
        { type: "json_field", field: "implementation.repositoryChange", equals: true },
        { type: "command_profile", profile: "repositoryTest", expect: { contains: "ACTIVATION_TEST_OK" } },
      ],
      releasePaths: ["src/activation.js", "scripts/verify.mjs"],
      build: { testProfile: "repositoryTest", maxAttempts: 3 },
    },
  });
  signal(context.store, {
    kind: "incident",
    source: "test://production-observation/duplicate-entry",
    content: "A real observed activation run repeated the same data-entry step twice.",
  });
  return { ...context, builderPath };
}

test("a builder that fails the project check is retried with the failure as feedback", async (t) => {
  const { store, kernel, workspace } = await prepareWorkspace(t, selfRepairingBuilder);

  const run = await kernel.run({ maxCycles: 8, maxTasks: 20 });
  assert.equal(run.failed, 0);
  assert.equal(run.completed, 6);

  const artifact = store.artifactsForGoal("goal_test").find((item) => item.kind === "product.experiment");
  assert.equal(artifact.status, "verified");
  const parsed = JSON.parse(artifact.content);
  assert.equal(parsed.repair.passed, true);
  assert.equal(parsed.repair.attempts, 2, "the first attempt failed the project test and was retried");
  assert.deepEqual(parsed.repair.changedFiles, ["src/activation.js"]);
  assert.equal(await readFile(path.join(workspace, "src", "activation.js"), "utf8"), acceptedSource);

  const verdict = store.verdictForArtifact(artifact.id);
  assert.equal(verdict.passed, 1);
  const release = store.latestRelease("goal_test");
  assert.equal(release.status, "published_candidate");
  assert.equal(release.receipt.workspace.files, 2);
});

test("a builder that never satisfies the check leaves the workspace untouched", async (t) => {
  const builderPath = await builderScript(t, `import { writeFile } from "node:fs/promises";
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
  JSON.parse(input);
  await writeFile("src/activation.js", ${JSON.stringify(brokenSource)}, "utf8");
  process.stdout.write(JSON.stringify({ type: "repository_change", summary: "no real fix", repositoryChange: true }));
});
`);
  const context = await runtime(t, {
    builder: { command: nodeBinary, args: [builderPath], timeoutMs: 30_000 },
    sandboxConfirmed: true,
    checks: {
      repositoryTest: { command: nodeBinary, args: ["scripts/verify.mjs"], timeoutMs: 30_000 },
    },
  });
  await file(context.workspace, "src/activation.js", brokenSource);
  await file(context.workspace, "scripts/verify.mjs", verifier);
  goal(context.store, {
    policy: {
      acceptance: [
        { type: "command_profile", profile: "repositoryTest", expect: { contains: "ACTIVATION_TEST_OK" } },
      ],
      releasePaths: ["src/activation.js"],
      build: { testProfile: "repositoryTest", maxAttempts: 2 },
    },
  });
  signal(context.store, { kind: "incident", source: "test://x/1", content: "A real observed failure." });

  const run = await context.kernel.run({ maxCycles: 4, maxTasks: 20 });
  assert.ok(run.completed > 0);

  const artifact = context.store.artifactsForGoal("goal_test").find((item) => item.kind === "product.experiment");
  const parsed = JSON.parse(artifact.content);
  assert.equal(parsed.repair.passed, false);
  assert.equal(parsed.repair.reason, "attempts_exhausted");
  assert.equal(parsed.repair.workspaceRestored, true);
  assert.equal(parsed.status, "rejected");
  assert.equal(await readFile(path.join(context.workspace, "src", "activation.js"), "utf8"), brokenSource);
  assert.equal(context.store.latestRelease("goal_test"), undefined, "a failed change can never become a release");
});

test("a builder that returns edits has them applied and verified by the engine", async (t) => {
  const { store, kernel, workspace } = await prepareWorkspace(t, editReturningBuilder);

  const run = await kernel.run({ maxCycles: 8, maxTasks: 20 });
  assert.equal(run.failed, 0);
  assert.equal(run.completed, 6);

  const artifact = store.artifactsForGoal("goal_test").find((item) => item.kind === "product.experiment");
  assert.equal(artifact.status, "verified");
  assert.equal(await readFile(path.join(workspace, "src", "activation.js"), "utf8"), acceptedSource);
  const release = store.latestRelease("goal_test");
  assert.equal(release.status, "published_candidate");
});

test("a builder is not allowed to touch files outside the allowed set", async (t) => {
  const builderPath = await builderScript(t, `import { writeFile } from "node:fs/promises";
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
  JSON.parse(input);
  await writeFile("src/activation.js", ${JSON.stringify(acceptedSource)}, "utf8");
  await writeFile("secrets.env", "TOKEN=leaked", "utf8");
  process.stdout.write(JSON.stringify({ type: "repository_change", summary: "fixed", repositoryChange: true }));
});
`);
  const context = await runtime(t, {
    builder: { command: nodeBinary, args: [builderPath], timeoutMs: 30_000 },
    sandboxConfirmed: true,
    checks: {
      repositoryTest: { command: nodeBinary, args: ["scripts/verify.mjs"], timeoutMs: 30_000 },
    },
  });
  await file(context.workspace, "src/activation.js", brokenSource);
  await file(context.workspace, "scripts/verify.mjs", verifier);
  goal(context.store, {
    policy: {
      acceptance: [{ type: "command_profile", profile: "repositoryTest", expect: { contains: "ACTIVATION_TEST_OK" } }],
      releasePaths: ["src/activation.js"],
      build: { testProfile: "repositoryTest", maxAttempts: 1, allowedPaths: ["src/activation.js"] },
    },
  });
  signal(context.store, { kind: "incident", source: "test://x/1", content: "A real observed failure." });

  await context.kernel.run({ maxCycles: 4, maxTasks: 20 });
  const artifact = context.store.artifactsForGoal("goal_test").find((item) => item.kind === "product.experiment");
  const parsed = JSON.parse(artifact.content);
  assert.equal(parsed.repair.passed, false);
  assert.equal(parsed.repair.reason, "out_of_scope_edit");
  assert.equal(parsed.repair.workspaceRestored, true);
  assert.equal(parsed.status, "rejected");
  assert.equal(await readFile(path.join(context.workspace, "secrets.env"), "utf8").catch(() => null), null);
});
