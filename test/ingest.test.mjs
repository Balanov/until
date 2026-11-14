import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { Store } from "../src/store.js";
import { doctor } from "../src/doctor.js";
import { importSignals, mapRecordToSignal, parseCsv, parseRecords } from "../src/import.js";
import { buildGoalTemplate, detectProject } from "../src/onboard.js"
import { tailOutput, summarizeFailures } from "../src/checks.js";
import { validateSchema } from "../src/schema-validate.js";
import { directSchema, implementationSchema, researchSchema } from "../src/schema.js";

async function tempRoot(t) {
  const root = await mkdtemp(path.join(process.cwd(), ".until", "ingest-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return root;
}

function freshStore(t) {
  const store = new Store(":memory:");
  t.after(() => store.close());
  return store;
}

test("CSV exports parse with quoted fields, commas and escaped quotes", () => {
  const rows = parseCsv('id,content,source\n1,"Users said: ""it broke"", twice",support\n2,plain,ticket\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].content, 'Users said: "it broke", twice');
  assert.equal(rows[1].content, "plain");
});

test("JSON, JSONL and CSV exports all normalize to the same record shape", () => {
  const json = parseRecords('[{"content":"a","source":"s"}]', "auto");
  const jsonl = parseRecords('{"content":"a","source":"s"}\n{"content":"b","source":"s"}\n', "auto");
  const csv = parseRecords("content,source\na,s\nb,s\n", "auto");
  assert.equal(json.length, 1);
  assert.equal(jsonl.length, 2);
  assert.equal(csv.length, 2);
});

test("imported evidence without a consent assertion stays a hypothesis", async (t) => {
  const root = await tempRoot(t);
  const store = freshStore(t);
  store.addGoal({ id: "goal_x", title: "t", outcome: "o" });
  const file = path.join(root, "support.csv");
  await writeFile(file, "content,source\nCustomer cannot export the report,helpdesk\n", "utf8");

  const summary = await importSignals(store, { file, goalId: "goal_x", kind: "support" });
  assert.equal(summary.records, 1);
  assert.equal(summary.withConsent, 0);
  assert.equal(summary.withoutConsent, 1);
  const stored = store.signalsForGoal("goal_x")[0];
  assert.equal(stored.consent, 0);
});

test("an explicit consent assertion unlocks real evidence", async (t) => {
  const root = await tempRoot(t);
  const store = freshStore(t);
  store.addGoal({ id: "goal_x", title: "t", outcome: "o" });
  const file = path.join(root, "support.csv");
  await writeFile(file, "content,source\nCustomer cannot export the report,helpdesk\n", "utf8");

  const summary = await importSignals(store, { file, goalId: "goal_x", kind: "support", consent: true });
  assert.equal(summary.withConsent, 1);
  const stored = store.signalsForGoal("goal_x")[0];
  assert.equal(stored.consent, 1);
  const { realEvidence } = await import("../src/policy.js");
  assert.equal(realEvidence(store.signalsForGoal("goal_x")).length, 1);
});

test("a record without content or source is rejected with its position", async (t) => {
  const root = await tempRoot(t);
  const store = freshStore(t);
  store.addGoal({ id: "goal_x", title: "t", outcome: "o" });
  const file = path.join(root, "bad.json");
  await writeFile(file, JSON.stringify([{ source: "s" }]), "utf8");
  await assert.rejects(
    importSignals(store, { file, goalId: "goal_x", kind: "support" }),
    /Record 1: Record has no recognizable content field/,
  );
});

test("an unsupported signal kind is rejected", () => {
  assert.throws(
    () => mapRecordToSignal({ content: "x", source: "s" }, { goalId: "g", kind: "rumor" }),
    /kind is missing or unsupported/,
  );
});

test("re-running an import does not duplicate evidence", async (t) => {
  const root = await tempRoot(t);
  const store = freshStore(t);
  store.addGoal({ id: "goal_x", title: "t", outcome: "o" });
  const file = path.join(root, "support.csv");
  await writeFile(file, "id,content,source\nt-1,Export fails,helpdesk\n", "utf8");

  const first = await importSignals(store, { file, goalId: "goal_x", kind: "support" });
  assert.equal(first.imported.length, 1);
  assert.equal(first.skipped.length, 0);

  const second = await importSignals(store, { file, goalId: "goal_x", kind: "support" });
  assert.equal(second.imported.length, 0);
  assert.equal(second.skipped.length, 1);
  assert.equal(second.skipped[0].reason, "already_present");
  assert.equal(store.signalsForGoal("goal_x").length, 1);
});

test("command output keeps its tail, where the failure is reported", () => {
  const text = `${"noise\n".repeat(200)}THE FAILURE DETAIL`;
  const kept = tailOutput(text, 200);
  assert.match(kept, /THE FAILURE DETAIL/);
  assert.match(kept, /truncated/);
  assert.equal(tailOutput("short", 200), "short");
});

test("a failing check reports the failure, not the log of passing tests", () => {
  const summary = summarizeFailures([
    "✔ one passed (10ms)",
    "✔ two passed (10ms)",
    "✖ the real failure (5ms)",
    "  AssertionError: expected 1 to equal 2",
    "ℹ tests 3",
    "ℹ pass 2",
    "ℹ fail 1",
  ].join("\n"));
  assert.match(summary, /the real failure/);
  assert.match(summary, /AssertionError/);
  assert.doesNotMatch(summary, /one passed/);
  assert.doesNotMatch(summary, /two passed/);
});

test("the doctor reports a dead-lettered task instead of hiding it", async (t) => {
  const store = freshStore(t);
  store.addGoal({ id: "goal_x", title: "t", outcome: "o" });
  const queued = store.enqueue({ goalId: "goal_x", role: "researcher", kind: "research.synthesize", contract: { goalId: "goal_x", generation: 1 } });
  store.leaseNext("w");
  store.failTask(queued.task.id, store.getTask(queued.task.id).lease_token, new Error("boom"), { retry: false });
  assert.equal(store.getTask(queued.task.id).state, "dead");

  const report = await doctor(store, { workspace: process.cwd(), config: {} });
  const dead = report.checks.find((item) => item.id === "queue.dead_letter");
  assert.equal(dead.status, "warn");
  assert.match(dead.message, /exhausted their attempt budget/);
  assert.equal(dead.detail.remedy, "until replay <taskId>");
});

test("a dead task can be replayed by an operator and keeps its idempotency key", async (t) => {
  const store = freshStore(t);
  store.addGoal({ id: "goal_x", title: "t", outcome: "o" });
  const queued = store.enqueue({ goalId: "goal_x", role: "researcher", kind: "research.synthesize", contract: { goalId: "goal_x", generation: 1 } });
  const leased = store.leaseNext("w");
  store.failTask(queued.task.id, leased.lease_token, new Error("boom"), { retry: false });

  const replayed = store.requeueDeadTask(queued.task.id);
  assert.equal(replayed.state, "queued");
  assert.equal(replayed.idempotency_key, queued.task.idempotency_key);
  assert.equal(replayed.max_attempts, 3);
  assert.equal(replayed.attempts, 1);
  assert.throws(() => store.requeueDeadTask("task_missing"), /Task not found/);
  assert.throws(() => store.requeueDeadTask(queued.task.id), /Only dead or canceled tasks/);
});

test("the generated gate keeps the project's own test arguments", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "demo",
    scripts: { test: "node --test --test-reporter=spec test/*.test.mjs" },
  }), "utf8");
  const project = await detectProject(root);
  // The whole argument vector is kept: dropping the reporter or the file pattern
  // would silently run a different, weaker suite than the project runs itself.
  assert.deepEqual(project.testArgs, ["--test", "--test-reporter=spec", "test/*.test.mjs"]);
  assert.equal(project.label, "node --test --test-reporter=spec test/*.test.mjs");
});

test("a script the shell would interpret falls back to the package manager", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "demo",
    scripts: { test: "node --test && node scripts/lint.mjs" },
  }), "utf8");
  const project = await detectProject(root);
  assert.equal(project.testCommand, process.platform === "win32" ? "npm.cmd" : "npm");
  assert.deepEqual(project.testArgs, ["test"]);
});

test("repository onboarding detects the project's own test command", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "node --test" } }), "utf8");
  const project = await detectProject(root);
  assert.equal(project.language, "javascript");
  assert.equal(project.label, "node --test");
  assert.deepEqual(project.testArgs, ["--test"]);
});

test("onboarding detects a python project and a project with no test command", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "pyproject.toml"), "[project]\nname='x'\n", "utf8");
  const python = await detectProject(root);
  assert.equal(python.language, "python");
  assert.equal(python.label, "python -m pytest");

  const empty = await mkdtemp(path.join(process.cwd(), ".until", "empty-"));
  t.after(async () => { await rm(empty, { recursive: true, force: true }); });
  const unknown = await detectProject(empty);
  assert.equal(unknown.testCommand, null);
  assert.throws(() => buildGoalTemplate(unknown, {}), /No test command was detected/);
});

test("the generated goal locks the project's own test command as the acceptance gate", async (t) => {
  const root = await tempRoot(t);
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "node --test" } }), "utf8");
  const project = await detectProject(root);
  const template = buildGoalTemplate(project, { title: "Improve demo", outcome: "More demos" });
  assert.deepEqual(template.goal.policy.acceptance, [
    { type: "command_profile", profile: "repoTest", expect: { exitCode: 0 } },
  ]);
  assert.equal(template.config.checks.repoTest.args[0], "--test");
  assert.ok(template.notes.some((note) => /acceptance/i.test(note)));
});

test("model output is validated locally against the role schema", () => {
  const schema = { type: "object", additionalProperties: false, properties: { score: { type: "number", minimum: 0, maximum: 1 } }, required: ["score"] };
  assert.equal(validateSchema({ score: 0.5 }, schema).valid, true);
  assert.equal(validateSchema({ score: 2 }, schema).valid, false);
  assert.equal(validateSchema({}, schema).valid, false);
  assert.equal(validateSchema({ score: 0.5, extra: 1 }, schema).valid, false);
});

test("an acceptance check constrains the implementation object the builder returns", () => {
  const checks = [{ type: "json_field", field: "implementation.repositoryChange", equals: true }];
  const schema = implementationSchema(checks);
  // The builder response becomes the artifact's `implementation` field, so the
  // check constrains the root of that response.
  assert.deepEqual(schema.properties.repositoryChange, { const: true });
  assert.deepEqual(schema.required, ["repositoryChange"]);
});

test("the direct baseline schema requires the fields it declares and nothing else", () => {
  const schema = directSchema({ id: "g1", policy: { acceptance: [{ type: "json_field", field: "implementation.repositoryChange", equals: true }] } }, []);
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("implementation"));
  assert.deepEqual(schema.properties.implementation.required, ["repositoryChange"]);
});

test("a nested acceptance path never requires itself", () => {
  const schema = directSchema({
    id: "g1",
    policy: { acceptance: [{ type: "json_field", field: "implementation.a.b", equals: true }] },
  }, []);
  assert.ok(schema.required.includes("implementation"));
  assert.deepEqual(schema.properties.implementation.required, ["a"]);
  assert.deepEqual(schema.properties.implementation.properties.a.required, ["b"]);
  assert.equal(schema.properties.implementation.required.includes("implementation"), false);
  assert.equal(schema.properties.implementation.properties.a.required.includes("implementation"), false);
});

test("a research schema without signals cannot demand an evidence id", () => {
  const schema = researchSchema([]);
  assert.equal(schema.properties.evidenceIds.minItems, undefined);
  assert.equal(schema.properties.evidenceIds.maxItems, 0);
  assert.equal(schema.required.includes("evidenceIds"), false);
});
