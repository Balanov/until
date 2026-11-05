import test from "node:test";
import assert from "node:assert/strict";
import { runtime, goal, signal } from "./helpers.mjs";

async function queued(store, overrides = {}) {
  if (!store.getGoal("goal_test")) goal(store);
  const { task } = store.enqueue({
    goalId: "goal_test",
    role: "researcher",
    kind: "research.synthesize",
    contract: { goalId: "goal_test", generation: 1 },
    ...overrides,
  });
  return task;
}

test("task enqueue is idempotent", async (t) => {
  const { store } = await runtime(t);
  goal(store);
  const input = {
    goalId: "goal_test",
    role: "researcher",
    kind: "research.synthesize",
    contract: { goalId: "goal_test", generation: 1 },
    idempotencyKey: "same-logical-task",
  };
  const first = store.enqueue(input);
  const second = store.enqueue(input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.task.id, first.task.id);
  assert.equal(store.listTasks().length, 1);
});

test("lease and completion accept only the current lease", async (t) => {
  const { store } = await runtime(t);
  const item = await queued(store);
  const leased = store.leaseNext("worker-a");
  assert.equal(leased.id, item.id);
  assert.equal(leased.attempts, 1);
  assert.equal(store.completeTask(item.id, "wrong-lease").accepted, false);
  assert.equal(store.completeTask(item.id, leased.lease_token).accepted, true);
  assert.equal(store.getTask(item.id).state, "done");
});

test("a failed task retries within its attempt budget", async (t) => {
  const { store } = await runtime(t);
  const item = await queued(store, { maxAttempts: 2 });
  const leased = store.leaseNext("worker-a");
  const failure = store.failTask(item.id, leased.lease_token, "transient", { backoffMs: 0 });
  assert.equal(failure.retried, true);
  assert.equal(failure.task.state, "queued");
  const second = store.leaseNext("worker-a");
  assert.equal(second.attempts, 2);
  const dead = store.failTask(item.id, second.lease_token, "permanent", { backoffMs: 0 });
  assert.equal(dead.retried, false);
  assert.equal(dead.task.state, "dead");
});

test("expired leases recover without accepting the old completion", async (t) => {
  const { store } = await runtime(t);
  const item = await queued(store);
  const leased = store.leaseNext("worker-a");
  store.db.prepare("UPDATE tasks SET lease_until = 0 WHERE id = ?").run(item.id);
  const recovered = store.recoverLeases();
  assert.equal(recovered.recovered, 1);
  assert.equal(store.completeTask(item.id, leased.lease_token).accepted, false);
  const next = store.leaseNext("worker-b");
  assert.notEqual(next.lease_token, leased.lease_token);
});

test("stop fences queued work and rejects a late completion", async (t) => {
  const { store } = await runtime(t);
  const item = await queued(store);
  const leased = store.leaseNext("worker-a");
  const stopped = store.stop("test emergency");
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.epoch, 1);
  const completion = store.completeTask(item.id, leased.lease_token, { claimed: "success" });
  assert.equal(completion.accepted, false);
  assert.equal(completion.reason, "epoch_changed");
  assert.equal(store.getTask(item.id).state, "canceled");
  assert.equal(store.leaseNext("worker-b"), null);
});

test("reset clears the latch but never reuses an epoch", async (t) => {
  const { store } = await runtime(t);
  store.stop();
  const state = store.reset();
  assert.equal(state.stopped, false);
  assert.equal(state.epoch, 1);
});

test("dependencies do not become ready before their parent completes", async (t) => {
  const { store } = await runtime(t);
  const parent = await queued(store);
  const child = await queued(store, {
    role: "owner",
    kind: "product.contract",
    dependsOn: [parent.id],
    idempotencyKey: "child",
  });
  assert.equal(store.readyTasks().some((item) => item.id === child.id), false);
  const leased = store.leaseNext("worker");
  store.completeTask(parent.id, leased.lease_token);
  assert.equal(store.readyTasks().some((item) => item.id === child.id), true);
});

test("event hash chain verifies and detects tampering", async (t) => {
  const { store } = await runtime(t);
  goal(store);
  signal(store);
  assert.equal(store.verifyEvents().valid, true);
  store.db.prepare("UPDATE events SET payload = ? WHERE id = 1").run('{"tampered":true}');
  const result = store.verifyEvents();
  assert.equal(result.valid, false);
  assert.equal(result.reason, "event_hash_mismatch");
});

test("only independently verified artifacts can become releases", async (t) => {
  const { store } = await runtime(t);
  const item = await queued(store);
  const artifact = store.addArtifact({ goalId: "goal_test", taskId: item.id, kind: "test", content: "{}", status: "working" });
  assert.throws(() => store.createRelease({ artifactId: artifact.id, goalId: "goal_test", idempotencyKey: "r1" }), /verified/);
});

test("outbox deduplicates the exact logical action", async (t) => {
  const { store } = await runtime(t);
  const input = { action: "artifact.publish", digest: "digest-1", payload: { releaseId: "r1" } };
  assert.equal(store.addOutbox(input).created, true);
  assert.equal(store.addOutbox(input).created, false);
  assert.equal(store.pendingOutbox().length, 1);
});
