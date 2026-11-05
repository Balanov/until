import test from "node:test";
import assert from "node:assert/strict";
import { ModelRouter, OpenAICompatibleModel, parseModelJson } from "../src/model.js";
import { runtime, goal } from "./helpers.mjs";

test("model JSON parser accepts a JSON fence but rejects empty output", () => {
  assert.deepEqual(parseModelJson('```json\n{"ok":true}\n```'), { ok: true });
  assert.throws(() => parseModelJson(""), /empty/);
});

test("OpenAI-compatible adapter measures usage and cost", async () => {
  const fetchImpl = async (url, options) => {
    assert.match(url, /\/chat\/completions$/);
    assert.equal(options.headers.authorization, "Bearer test-secret");
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const model = new OpenAICompatibleModel({
    baseURL: "http://localhost:11434/v1",
    model: "local-test",
    apiKeyEnv: "UNTIL_TEST_KEY",
    pricing: { inputPerMillion: 2, outputPerMillion: 4 },
  }, { fetchImpl });
  process.env.UNTIL_TEST_KEY = "test-secret";
  const result = await model.complete({ system: "test", input: {} });
  assert.equal(result.cost, (100 * 2 + 50 * 4) / 1_000_000);
  assert.equal(result.inputTokens, 100);
  assert.equal(result.outputTokens, 50);
  delete process.env.UNTIL_TEST_KEY;
});

test("missing price card yields unknown cost, not a fake zero", async () => {
  const model = new OpenAICompatibleModel({
    baseURL: "http://localhost:11434/v1",
    model: "local-test",
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })),
  });
  const result = await model.complete({ system: "test", input: {} });
  assert.equal(result.cost, null);
});

test("truncated model output is rejected", async () => {
  const model = new OpenAICompatibleModel({ baseURL: "http://localhost:11434/v1", model: "local-test" }, {
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"partial":' }, finish_reason: "length" }],
    })),
  });
  await assert.rejects(model.complete({ system: "test", input: {} }), /truncated/);
});

test("non-allowlisted model endpoints fail before network access", async () => {
  let called = false;
  assert.throws(() => new OpenAICompatibleModel({
    baseURL: "https://example.com/v1",
    allowedOrigins: ["http://localhost:11434"],
    model: "remote",
  }, { fetchImpl: async () => { called = true; return new Response("{}"); } }), /allowlisted/);
  assert.equal(called, false);
});

test("replay calls are recorded as zero-cost fixtures, separately from real models", async (t) => {
  const models = {
    researcher: { type: "replay", responses: { "research.synthesize": [{ statement: "x", mechanism: "y", evidenceIds: [], score: 0 }] } },
  };
  const { store, models: router } = await runtime(t, { models });
  goal(store);
  await router.complete({ role: "researcher", kind: "research.synthesize", system: "test", input: {} });
  const usage = store.modelUsage();
  assert.equal(usage.length, 1);
  assert.match(usage[0].model, /^replay:/);
  assert.equal(usage[0].known_cost, 0);
});

test("provider HTTP errors do not become successful model output", async () => {
  const model = new OpenAICompatibleModel({ baseURL: "http://localhost:11434/v1", model: "local-test" }, {
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: "quota exhausted" } }), { status: 429 }),
  });
  await assert.rejects(model.complete({ system: "test", input: {} }), /429/);
});
