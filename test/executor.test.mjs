import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  applyEdits,
  diffManifests,
  isExcluded,
  normalizeRelative,
  resolveEditablePath,
  restoreFromSnapshot,
  snapshotWorkspace,
} from "../src/executor/workspace.js";
import { normalizeBuilderResponse, runRepairLoop } from "../src/executor/repair.js";

async function tempRoot(t) {
  const root = await mkdtemp(path.join(process.cwd(), ".until", "executor-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return root;
}

test("edit paths are normalized, traversal is rejected and excluded trees are never entered", () => {
  assert.equal(normalizeRelative("./src/app.js"), "src/app.js");
  assert.equal(normalizeRelative("src\\app.js"), "src/app.js");
  assert.throws(() => normalizeRelative("../outside.js"), /traverse upwards/);
  assert.throws(() => normalizeRelative("/etc/passwd"), /workspace-relative/);
  assert.throws(() => normalizeRelative("C:/windows/system32"), /workspace-relative/);
  assert.equal(isExcluded("node_modules/pkg/index.js"), true);
  assert.equal(isExcluded(".until/state.db"), true);
  assert.equal(isExcluded("src/app.js"), false);
});

test("an edit outside the allowed set is rejected before anything is written", async (t) => {
  const root = await tempRoot(t);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "original", "utf8");
  await assert.rejects(
    applyEdits(root, [{ path: "src/app.js", content: "changed" }], { allow: ["src/other.js"] }),
    /not in the allowed set/,
  );
  assert.equal(await readFile(path.join(root, "src", "app.js"), "utf8"), "original");
});

test("applied edits are recorded with content hashes and diffed against the snapshot", async (t) => {
  const root = await tempRoot(t);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "app.js"), "original", "utf8");
  await writeFile(path.join(root, "keep.txt"), "keep", "utf8");

  const before = await snapshotWorkspace(root);
  const applied = await applyEdits(root, [
    { path: "src/app.js", content: "changed" },
    { path: "src/new.js", content: "added" },
  ]);
  const after = await snapshotWorkspace(root);

  assert.equal(applied.applied.length, 2);
  assert.equal(applied.applied.find((item) => item.path === "src/app.js").created, false);
  assert.equal(applied.applied.find((item) => item.path === "src/new.js").created, true);
  assert.deepEqual(diffManifests(before, after), {
    added: ["src/new.js"],
    modified: ["src/app.js"],
    removed: [],
  });
  assert.notEqual(before.hash, after.hash);
});

test("a failed repair restores the workspace byte for byte", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "app.js"), "original", "utf8");

  const result = await runRepairLoop({
    workspace: root,
    maxAttempts: 2,
    propose: async ({ attempt }) => ({
      edits: [{ path: "app.js", content: `broken-${attempt}` }],
      notes: `attempt ${attempt}`,
    }),
    verify: async () => ({ passed: false, output: "AssertionError: expected original" }),
  });

  assert.equal(result.passed, false);
  assert.equal(result.reason, "attempts_exhausted");
  assert.equal(result.workspaceRestored, true);
  assert.equal(await readFile(path.join(root, "app.js"), "utf8"), "original");
  assert.deepEqual(result.changes, { added: [], modified: [], removed: [] });
});

test("the repair loop hands the failed check back and succeeds on a later attempt", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "app.js"), "original", "utf8");
  const seen = [];

  const result = await runRepairLoop({
    workspace: root,
    maxAttempts: 3,
    propose: async ({ attempt, feedback }) => {
      seen.push({ attempt, feedback });
      return { edits: [{ path: "app.js", content: attempt === 1 ? "broken" : "fixed" }] };
    },
    verify: async ({ attempt }) => ({ passed: attempt > 1, output: attempt > 1 ? "OK" : "AssertionError" }),
  });

  assert.equal(result.passed, true);
  assert.equal(result.attempts.length, 2);
  assert.equal(seen[0].feedback, null);
  assert.match(seen[1].feedback.failedCheck, /AssertionError/);
  assert.equal(await readFile(path.join(root, "app.js"), "utf8"), "fixed");
  assert.deepEqual(result.changes.modified, ["app.js"]);
});

test("the failed check output reaches the next attempt as feedback", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "app.js"), "original", "utf8");
  const feedbackSeen = [];

  await runRepairLoop({
    workspace: root,
    maxAttempts: 2,
    propose: async ({ attempt, feedback }) => {
      feedbackSeen.push(feedback);
      return { edits: [{ path: "app.js", content: `v${attempt}` }] };
    },
    verify: async () => ({ passed: false, output: "AssertionError: 3 !== 4" }),
  });

  assert.equal(feedbackSeen[0], null);
  assert.match(feedbackSeen[1].failedCheck, /AssertionError/);
  assert.deepEqual(feedbackSeen[1].changedFiles, ["app.js"]);
});

test("a builder that crashes is a failed attempt, not a dead loop", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "app.js"), "original", "utf8");
  const feedbackSeen = [];
  let calls = 0;

  const result = await runRepairLoop({
    workspace: root,
    maxAttempts: 3,
    propose: async ({ attempt, feedback }) => {
      calls += 1;
      feedbackSeen.push(feedback);
      if (attempt === 1) throw new Error("External builder timed out after 600000 ms");
      return { edits: [{ path: "app.js", content: "fixed" }] };
    },
    verify: async () => ({ passed: (await readFile(path.join(root, "app.js"), "utf8")) === "fixed", output: "checked" }),
  });

  assert.equal(calls, 2, "a crashed builder must not abort the loop");
  assert.equal(result.passed, true);
  assert.match(result.attempts[0].builderError, /timed out/);
  assert.match(result.attempts[0].output, /the builder failed/);
  assert.ok(feedbackSeen[1], "the next attempt receives the failure as feedback");
});

test("a proposer that returns nothing is reported as no change, not as success", async (t) => {
  const root = await tempRoot(t);
  const result = await runRepairLoop({
    workspace: root,
    maxAttempts: 2,
    propose: async () => ({ edits: [] }),
    verify: async () => ({ passed: false, output: "still broken" }),
  });
  assert.equal(result.passed, false);
  assert.equal(result.attempts.length, 2, "an empty edit list is not a decline, it is another attempt");
  assert.equal(result.reason, "attempts_exhausted");
});

test("a builder that changes nothing is retried with the failing output", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "app.js"), "original", "utf8");
  const feedbackSeen = [];
  let calls = 0;

  const result = await runRepairLoop({
    workspace: root,
    maxAttempts: 3,
    propose: async ({ attempt, feedback }) => {
      calls += 1;
      feedbackSeen.push(feedback);
      if (attempt === 1) return { edits: [], notes: "I ran out of budget before changing anything" };
      return { edits: [{ path: "app.js", content: "fixed" }] };
    },
    verify: async () => ({ passed: (await readFile(path.join(root, "app.js"), "utf8")) === "fixed", output: "checked" }),
  });

  assert.equal(calls, 2, "the builder must get a second attempt with the failing output");
  assert.equal(result.passed, true);
  assert.equal(feedbackSeen[0], null);
  assert.equal(feedbackSeen[1].attempt, 1);
  assert.ok(feedbackSeen[1].failedCheck, "the second attempt must receive the failed check output");
});

test("an explicit decline stops the loop immediately", async (t) => {
  const root = await tempRoot(t);
  let calls = 0;
  const result = await runRepairLoop({
    workspace: root,
    maxAttempts: 3,
    propose: async () => { calls += 1; return { declined: true, notes: "this cannot be fixed here" }; },
    verify: async () => ({ passed: true, output: "should never run" }),
  });
  assert.equal(calls, 1);
  assert.equal(result.passed, false);
  assert.equal(result.reason, "declined_by_builder");
  assert.equal(result.notes, "this cannot be fixed here");
});

test("a restored snapshot removes files the change created", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "app.js"), "original", "utf8");
  const before = await snapshotWorkspace(root, { captureContent: true });
  await writeFile(path.join(root, "app.js"), "changed", "utf8");
  await writeFile(path.join(root, "extra.js"), "new", "utf8");
  const restored = await restoreFromSnapshot(root, before);
  assert.deepEqual(restored, ["app.js", "extra.js"]);
  assert.equal(await readFile(path.join(root, "app.js"), "utf8"), "original");
});

test("both builder protocols are recognized and v2 edits are validated", () => {
  const legacy = normalizeBuilderResponse({ type: "repository_change", repositoryChange: true });
  assert.equal(legacy.protocol, "until-builder/v1");
  assert.equal(legacy.edits, null);

  const modern = normalizeBuilderResponse({ edits: [{ path: "src/a.js", content: "x" }] });
  assert.equal(modern.protocol, "until-builder/v2");
  assert.equal(modern.edits.length, 1);

  assert.throws(() => normalizeBuilderResponse({ edits: [{ path: "a.js" }] }), /requires string content/);
  assert.throws(() => normalizeBuilderResponse("nope"), /must be an object/);
});
