import test from "node:test";
import assert from "node:assert/strict";
import { runtime, goal, signal } from "./helpers.mjs";
import { ModelRouter, OpenAICompatibleModel } from "../src/model.js";
import { Store } from "../src/store.js";
import { exportProof } from "../src/export.js";
import { directSchema, implementationSchema } from "../src/schema.js";

const locked = [{ type: "json_field", field: "implementation.feature", equals: "required-feature" }];

test("a model cannot replace acceptance checks supplied by the goal owner", async (t) => {
  const models = Object.fromEntries(["owner", "builder"].map((role) => [role, {
    type: "replay",
    responses: role === "owner" ? {
      "product.contract": [{ title: "Weak self acceptance", summary: "Try to omit the required feature", checks: [{ type: "file_exists" }], risk: "low" }],
    } : {
      "delivery.build": [{ feature: "required-feature" }],
    },
  }]));
  const { store, kernel } = await runtime(t, { models });
  goal(store, { policy: { acceptance: locked } });
  signal(store);
  await kernel.run({ maxCycles: 8, maxTasks: 20 });
  const build = store.listTasks().find((task) => task.kind === "delivery.build");
  assert.ok(build.contract.spec.checks.some((check) => check.field === "implementation.feature" && check.equals === "required-feature"));
  assert.equal(store.latestRelease("goal_test").status, "published_candidate");
});

test("live contracts without externally anchored acceptance fail closed", async (t) => {
  const models = { owner: { type: "replay", responses: { "product.contract": [{ title: "Anything", summary: "Anything passes", checks: [{ type: "file_exists" }], risk: "low" }] } } };
  const { store, kernel } = await runtime(t, { models });
  goal(store);
  signal(store);
  await kernel.run({ maxCycles: 8, maxTasks: 20 });
  assert.equal(store.listTasks().some((task) => task.kind === "delivery.build"), false);
  assert.match(store.listTasks().find((task) => task.kind === "product.contract").last_error, /goal.policy.acceptance/);
});

test("structured output sends a strict schema while preserving the input prompt", async () => {
  let body;
  const model = new OpenAICompatibleModel({ baseURL: "http://localhost:11434/v1", model: "local-test" }, {
    fetchImpl: async (url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"feature":"x"}' }, finish_reason: "stop" }] }));
    },
  });
  await model.complete({ system: "same system", input: { same: "prompt" }, schema: implementationSchema(locked) });
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(body.messages[1], { role: "user", content: '{"same":"prompt"}' });
  assert.deepEqual(body.response_format.json_schema.schema.properties.feature, { const: "required-feature" });
});

test("direct and implementation schemas cannot include prototype paths", () => {
  assert.throws(() => implementationSchema([{ type: "json_field", field: "implementation.__proto__.admin", equals: true }]), /unsafe/);
  const schema = directSchema({ id: "g", policy: { acceptance: locked } }, [{ id: "s" }]);
  assert.deepEqual(schema.properties.implementation.properties.feature, { const: "required-feature" });
  assert.deepEqual(schema.properties.evidenceIds.items.enum, ["s"]);
});

test("response traces are opt-in, hash checked and exportable", async () => {
  const store = new Store(":memory:");
  try {
    const models = new ModelRouter({
      store,
      traceResponses: true,
      roles: { researcher: { type: "replay", responses: { "research.synthesize": [{ statement: "trace me" }] } } },
    });
    await models.complete({ role: "researcher", kind: "research.synthesize", system: "test", input: {} });
    const responses = store.modelResponses();
    assert.equal(responses.length, 1);
    assert.equal(JSON.parse(responses[0].content).statement, "trace me");
    const bundle = await exportProof(store);
    assert.equal(bundle.rawResponsesIncluded, true);
    assert.equal(bundle.integrity.valid, true);
    assert.equal(bundle.economics.providerCharges, 0);
  } finally { store.close(); }
});

test("unknown model prices never become zero business cost", () => {
  const store = new Store(":memory:");
  try {
    store.addModelCall({ role: "owner", model: "unknown-price", promptHash: "x", latencyMs: 1 });
    assert.equal(store.economics().providerCharges, null);
    assert.equal(store.economics().costPerPublishedCandidate, null);
    assert.equal(store.economics().unknownCostCalls, 1);
  } finally { store.close(); }
});
