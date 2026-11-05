import test from "node:test";
import assert from "node:assert/strict";
import { runtime, goal, signal } from "./helpers.mjs";

test("high-risk contracts stop before builder and never auto-retry", async (t) => {
  const models = {
    owner: {
      type: "replay",
      responses: {
        "product.contract": [{
          title: "Unbounded production migration",
          summary: "A high-risk action without a separately configured boundary",
          checks: [{ type: "file_exists" }],
          risk: "high",
        }],
      },
    },
  };
  const { store, kernel } = await runtime(t, { models });
  goal(store);
  signal(store);
  await kernel.run({ maxCycles: 8, maxTasks: 20 });
  assert.equal(store.getGoal("goal_test").status, "blocked_risk");
  assert.equal(store.listTasks().some((task) => task.kind === "delivery.build"), false);
  const contract = store.listTasks().find((task) => task.kind === "product.contract");
  assert.equal(contract.state, "dead");
  assert.equal(store.opportunitiesForGoal("goal_test")[0].status, "blocked_risk");
});

test("a terminal retryable failure produces a fresh research generation", async (t) => {
  const { store, kernel } = await runtime(t);
  goal(store);
  const evidence = signal(store);
  const opportunity = store.addOpportunity({
    goalId: "goal_test",
    statement: "Retry a failed bounded experiment",
    mechanism: "The previous executor reached a terminal failure",
    evidenceIds: [evidence.id],
    status: "contracted",
    generation: 1,
  });
  const { task } = store.enqueue({
    goalId: "goal_test",
    opportunityId: opportunity.id,
    role: "builder",
    kind: "delivery.build",
    contract: { goalId: "goal_test", generation: 1, spec: { title: "x", summary: "xxxxx", checks: [{ type: "file_exists" }] } },
  });
  const leased = store.leaseNext("worker");
  store.failTask(task.id, leased.lease_token, "terminal fixture", { retry: false });
  const created = kernel.director.ensureWork();
  assert.equal(created.length, 1);
  assert.equal(created[0].kind, "research.synthesize");
  assert.equal(created[0].contract.generation, 2);
});

test("goal and metric values must be finite", async (t) => {
  const { store } = await runtime(t);
  assert.throws(() => goal(store, { baseline: Number.POSITIVE_INFINITY }), /finite/);
  goal(store);
  assert.throws(() => signal(store, { value: Number.NaN }), /finite/);
});

test("signals require non-empty bounded content", async (t) => {
  const { store } = await runtime(t);
  goal(store);
  assert.throws(() => signal(store, { content: "   " }), /must contain/);
  assert.throws(() => signal(store, { source: "x".repeat(5000) }), /must contain/);
});
