import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { runtime, goal, signal, file, nodeBinary } from "./helpers.mjs";
import { readWorkspaceManifest } from "../src/workspace-release.js";

const initialSource = `export function activationSteps() {
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
const builder = `import { writeFile } from "node:fs/promises";
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
  JSON.parse(input);
  await writeFile("src/activation.js", ${JSON.stringify(acceptedSource)}, "utf8");
  process.stdout.write(JSON.stringify({ type: "repository_change", summary: "Removed duplicate activation entry", repositoryChange: true }));
});
`;

test("an observed product issue becomes a tested repository release candidate", async (t) => {
  const builderPath = path.join(process.cwd(), ".until", "repository-builder.mjs");
  await file(process.cwd(), path.join(".until", "repository-builder.mjs"), builder);
  const { store, kernel, workspace } = await runtime(t, {
    builder: { command: nodeBinary, args: [builderPath], timeoutMs: 30_000 },
    sandboxConfirmed: true,
    checks: {
      repositoryTest: {
        command: nodeBinary,
        args: ["scripts/verify.mjs"],
        timeoutMs: 30_000,
      },
    },
  });
  t.after(async () => { await import("node:fs/promises").then(({ rm }) => rm(builderPath, { force: true })); });
  await file(workspace, "src/activation.js", initialSource);
  await file(workspace, "scripts/verify.mjs", verifier);
  goal(store, {
    policy: {
      acceptance: [
        { type: "file_exists", path: "src/activation.js" },
        { type: "json_field", field: "implementation.repositoryChange", equals: true },
        { type: "command_profile", profile: "repositoryTest", expect: { contains: "ACTIVATION_TEST_OK" } },
      ],
      releasePaths: ["src/activation.js", "scripts/verify.mjs"],
    },
  });
  signal(store, {
    kind: "incident",
    source: "test://production-observation/duplicate-entry",
    content: "A real observed activation run repeated the same data-entry step twice.",
  });
  const run = await kernel.run({ maxCycles: 8, maxTasks: 20 });
  assert.equal(run.failed, 0);
  assert.equal(run.completed, 6);
  const artifact = store.artifactsForGoal("goal_test").find((item) => item.kind === "product.experiment");
  const verdict = store.verdictForArtifact(artifact.id);
  assert.equal(verdict.passed, 1);
  assert.equal(verdict.checks.find((item) => item.type === "command_profile").passed, true);
  const release = store.latestRelease("goal_test");
  assert.equal(release.status, "published_candidate");
  assert.equal(release.receipt.workspace.files, 2);
  const candidateSource = path.join(workspace, ".until", "releases", release.id, "workspace", "src", "activation.js");
  assert.equal(await readFile(candidateSource, "utf8"), acceptedSource);
  await writeFile(path.join(workspace, "src", "activation.js"), initialSource, "utf8");
  assert.equal(await readFile(candidateSource, "utf8"), acceptedSource, "candidate is immutable after later workspace edits");
  assert.equal(store.verifyEvents().valid, true);
});

test("workspace release paths cannot escape or include internal state", async (t) => {
  const { workspace } = await runtime(t);
  await file(workspace, "src/activation.js", initialSource);
  await assert.rejects(readWorkspaceManifest(workspace, ["../outside.js"]), /escapes workspace/);
  await assert.rejects(readWorkspaceManifest(workspace, [".until/state.db"]), /must not include/);
});
