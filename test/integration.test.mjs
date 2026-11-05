import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runtime, goal, signal, file, nodeBinary } from "./helpers.mjs";

test("a real signal reaches a verified release candidate and an observed outcome", async (t) => {
  const { store, kernel } = await runtime(t);
  goal(store);
  signal(store);
  const first = await kernel.run({ maxCycles: 8, maxTasks: 20 });
  assert.equal(first.failed, 0);
  assert.equal(first.completed, 6);
  const goalAfterRelease = store.getGoal("goal_test");
  assert.equal(goalAfterRelease.status, "observing");
  const release = store.latestRelease("goal_test");
  assert.equal(release.status, "published_candidate");
  const artifact = store.artifactsForGoal("goal_test").find((item) => item.kind === "product.experiment");
  assert.equal(artifact.status, "verified");
  assert.equal(Boolean(store.verdictForArtifact(artifact.id).passed), true);

  signal(store, {
    kind: "metric",
    source: "test://analytics/after-release",
    value: 0.45,
    observedAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const second = await kernel.run({ maxCycles: 2, maxTasks: 10 });
  assert.equal(second.failed, 0);
  assert.equal(store.getGoal("goal_test").status, "achieved");
  assert.equal(store.verifyEvents().valid, true);
});

test("a synthetic persona produces research but never delivery", async (t) => {
  const { store, kernel } = await runtime(t);
  goal(store);
  signal(store, { kind: "synthetic", source: "test://synthetic-persona" });
  const result = await kernel.run({ maxCycles: 8, maxTasks: 20 });
  assert.equal(result.completed, 1);
  assert.equal(store.getGoal("goal_test").status, "waiting_evidence");
  assert.equal(store.listTasks().some((task) => task.kind === "delivery.build"), false);
  assert.equal(store.artifactsForGoal("goal_test")[0].kind, "research.guide");
});

test("a later real signal restarts a synthetic-blocked cycle", async (t) => {
  const { store, kernel } = await runtime(t);
  goal(store);
  signal(store, { kind: "synthetic", source: "test://synthetic-persona" });
  await kernel.run({ maxCycles: 2 });
  signal(store, { id: "real-later", source: "test://real-later" });
  await kernel.run({ maxCycles: 8 });
  assert.equal(store.opportunitiesForGoal("goal_test").length, 2);
  assert.equal(store.listTasks().some((task) => task.kind === "delivery.build"), true);
  assert.equal(store.latestRelease("goal_test").status, "published_candidate");
});

test("an unmet observed target opens the next product cycle", async (t) => {
  const { store, kernel } = await runtime(t);
  goal(store);
  signal(store);
  await kernel.run({ maxCycles: 8 });
  signal(store, {
    kind: "metric",
    source: "test://analytics/target-missed",
    value: 0.25,
    observedAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await kernel.run({ maxCycles: 3, maxTasks: 20 });
  assert.equal(store.getGoal("goal_test").status, "observing");
  assert.ok(store.opportunitiesForGoal("goal_test").length >= 2);
  assert.equal(store.artifactsForGoal("goal_test").filter((item) => item.kind === "product.experiment").length, 2);
});

test("failed acceptance checks block release", async (t) => {
  const { store, kernel, agents } = await runtime(t);
  goal(store);
  signal(store);
  const original = agents.build;
  agents.build = async function patched(task) {
    const result = await original.call(this, task);
    const artifact = this.store.artifactsForTask(task.id)[0];
    this.store.db.prepare("UPDATE artifacts SET content = ? WHERE id = ?").run('{"status":"not_implemented"}', artifact.id);
    const absolute = path.join(this.workspace, artifact.path);
    await (await import("node:fs/promises")).writeFile(absolute, '{"status":"not_implemented"}', "utf8");
    return result;
  };
  await kernel.run({ maxCycles: 2, maxTasks: 20 });
  assert.equal(store.latestRelease("goal_test"), undefined);
  const rejected = store.artifactsForGoal("goal_test").find((item) => item.kind === "product.experiment");
  assert.equal(rejected.status, "rejected");
});

test("a model success claim without evidence does not bypass the gate", async (t) => {
  const models = {
    researcher: {
      type: "replay",
      responses: {
        "research.synthesize": [{
          statement: "Synthetic users allegedly love the idea",
          mechanism: "The model asserts demand without a real observation",
          evidenceIds: ["synthetic-only"],
          score: 1,
        }],
      },
    },
  };
  const { store, kernel } = await runtime(t, { models });
  goal(store);
  signal(store, { id: "synthetic-only", kind: "synthetic", source: "test://persona" });
  const result = await kernel.run({ maxCycles: 2 });
  assert.equal(store.getGoal("goal_test").status, "waiting_evidence");
  assert.equal(store.listTasks().some((task) => task.kind === "delivery.build"), false);
  assert.equal(result.failed, 0);
});

test("an external executor cannot run without explicit sandbox confirmation", async (t) => {
  const { store, kernel } = await runtime(t, {
    builder: { command: nodeBinary, args: ["-e", "process.stdin.resume()"] },
    sandboxConfirmed: false,
  });
  goal(store);
  signal(store);
  await kernel.run({ maxCycles: 2, maxTasks: 20 });
  assert.equal(store.latestRelease("goal_test"), undefined);
  const build = store.listTasks().find((task) => task.kind === "delivery.build");
  assert.equal(build.state, "dead");
  assert.match(build.last_error, /sandboxConfirmed/);
});

test("a command profile verifies actual output, not just exit code zero", async (t) => {
  const checks = {
    passing: {
      command: nodeBinary,
      args: ["-e", "process.stdout.write(JSON.stringify({proof:true}))"],
    },
  };
  const { store, workspace } = await runtime(t, { checks });
  goal(store);
  const task = await queuedArtifactTask(store);
  const artifact = store.addArtifact({ goalId: "goal_test", taskId: task.id, kind: "test", path: "artifact.json", status: "working" });
  await file(workspace, "artifact.json", '{"proof":true}');
  const { executeCheck } = await import("../src/checks.js");
  const result = await executeCheck(
    { type: "command_profile", profile: "passing", expect: { jsonField: { field: "proof", equals: true } } },
    { artifact, workspace, commandProfiles: checks },
  );
  assert.equal(result.passed, true);
});

async function queuedArtifactTask(store) {
  const { task } = store.enqueue({
    goalId: "goal_test",
    role: "builder",
    kind: "delivery.build",
    contract: { goalId: "goal_test", generation: 1, spec: { title: "x", summary: "xxxxx", checks: [{ type: "file_exists" }] } },
  });
  return task;
}
