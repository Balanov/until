#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../src/store.js";
import { Kernel } from "../src/kernel.js";
import { Agents } from "../src/agents.js";
import { ModelRouter } from "../src/model.js";
import { Evolver, EVIDENCE_FOCUSED_GENOME } from "../src/evolve.js";
import { exportProof } from "../src/export.js";
import { doctor } from "../src/doctor.js";
import { importSignals } from "../src/import.js";
import { buildGoalTemplate, detectProject } from "../src/onboard.js";
import { atomicWrite, resolveInside } from "../src/util.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

const HELP = `UNTIL ${VERSION} — done means proven.

Usage: until <command> [options]

Commands:
  init --goal FILE          Create a durable product goal
  init --from-repo DIR      Detect how a repository proves itself and write a ready goal + check profile
  signal add FILE          Add a typed, sourced signal
  signal list              List signals
  import --file FILE       Import evidence from a CSV, JSON or JSONL export
  run [--cycles N]         Work through open deficits (default: 8 cycles)
  start                    Keep observing and working until stop
  stop                     Advance epoch and reject late work
  reset                    Clear the stop latch; never reuse an epoch
  status                   Show goals, queue, model usage and audit state
  tasks                    Show task states and attempts
  doctor [--online]       Check the installation, the queue and the evidence ledger
  replay TASK_ID           Return a dead or canceled task to the queue
  audit                    Verify the event hash chain
  export --output FILE     Export tasks, verdicts, receipts and model traces
  evolve                   Evaluate a strategy on selection and held-out fixtures
  demo                     Run the complete local fixture cycle
  help                     Show this help

Common options:
  --workspace DIR          Workspace (default: current directory)
  --state FILE             SQLite state (default: .until/state.db)
  --config FILE            Model/executor JSON (default: until.config.json if present)

Import options:
  --goal ID                Goal that receives the imported evidence (required)
  --kind KIND              Signal kind for every record (interview|metric|incident|payment|observed|support|reported|inferred|synthetic)
  --source TEXT            Source recorded when the file has no source column
  --consent                Operator assertion that the records carry participant consent
  --format auto|csv|json|jsonl
  --dry-run                Parse and report without writing

Signal input:
  {"goalId":"...","kind":"interview|metric|incident|payment|observed|support|reported|inferred|synthetic",
   "source":"...","content":"...","consent":true,"value":0.0,"unit":"...","observedAt":"ISO time"}

Model configuration and external execution are opt-in. The default run is an explicitly marked deterministic fixture.
`;

// Flags that never take a value. Anything else consumes the next argument.
const BOOLEAN_FLAGS = new Set([
  "watch",
  "json",
  "help",
  "consent",
  "dry-run",
  "online",
  "reset-attempts",
]);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) { positional.push(item); continue; }
    const equal = item.indexOf("=");
    if (equal > 0) flags[item.slice(2, equal)] = item.slice(equal + 1);
    else if (BOOLEAN_FLAGS.has(item.slice(2))) flags[item.slice(2)] = true;
    else flags[item.slice(2)] = argv[++index];
  }
  return { positional, flags };
}

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    const wrapped = new Error(`Cannot read ${label} ${file}: ${error.message}`, { cause: error });
    wrapped.code = error.code;
    throw wrapped;
  }
}

async function optionalJson(file) {
  try { return await readJson(file, "configuration"); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

function makeOptions(flags) {
  const workspace = path.resolve(flags.workspace ?? process.cwd());
  const state = path.resolve(workspace, flags.state ?? ".until/state.db");
  return { workspace, state };
}

async function makeRuntime(flags, { deterministicOnly = false } = {}) {
  const { workspace, state } = makeOptions(flags);
  await mkdir(workspace, { recursive: true });
  const store = new Store(state);
  const config = deterministicOnly ? {} : await optionalJson(path.resolve(workspace, flags.config ?? "until.config.json"));
  if (!deterministicOnly && typeof config.structuredOutputs === "boolean") {
    for (const model of Object.values(config.models ?? {})) {
      if (model.type === "openai-compatible" && model.structuredOutputs === undefined) model.structuredOutputs = config.structuredOutputs;
    }
  }
  const models = new ModelRouter({ store, roles: config.models ?? {}, traceResponses: config.traceResponses === true });
  const agents = new Agents({
    store,
    models,
    workspace,
    commandProfiles: config.checks ?? {},
    builderProfile: config.builder ?? null,
    sandboxConfirmed: config.sandboxConfirmed === true,
  });
  return { store, agents, kernel: new Kernel({ store, agents, leaseMs: config.leaseMs ?? 30_000 }), workspace, state, config };
}

function print(value, flags) {
  if (flags.json || true) console.log(JSON.stringify(value, null, 2));
}

async function loadGoal(file) {
  const value = await readJson(path.resolve(file), "goal");
  if (!value || typeof value !== "object") throw new Error("Goal must be an object");
  return value;
}

async function demo(flags) {
  const { workspace } = makeOptions(flags);
  const demoRoot = path.join(workspace, ".until", "demo");
  await rm(demoRoot, { recursive: true, force: true });
  await mkdir(demoRoot, { recursive: true });
  const localFlags = { ...flags, workspace: demoRoot, state: ".until/state.db" };
  const runtime = await makeRuntime(localFlags, { deterministicOnly: true });
  try {
    runtime.store.addGoal({
      id: "goal_activation",
      title: "Improve activation after a real observed friction",
      outcome: "Increase completed activation rate",
      baseline: 0.4,
      target: 0.55,
      unit: "ratio",
    });
    runtime.store.addSignal({
      goalId: "goal_activation",
      kind: "interview",
      source: "fixture://real-interview/001",
      content: "A consenting participant abandoned activation after the third duplicate data entry step.",
      consent: true,
      observedAt: "2026-11-05T00:00:00.000Z",
    });
    const run = await runtime.kernel.run({ maxCycles: 8, maxTasks: 20 });
    runtime.store.addSignal({
      goalId: "goal_activation",
      kind: "metric",
      source: "fixture://analytics/activation-after-candidate",
      content: "Observed activation ratio after the release candidate fixture.",
      value: 0.56,
      unit: "ratio",
      consent: true,
      observedAt: "2026-11-05T01:00:00.000Z",
    });
    const observed = await runtime.kernel.run({ maxCycles: 2, maxTasks: 10 });
    const benchmark = await readJson(path.join(ROOT, "benchmarks", "strategy.json"), "benchmark");
    const evolution = new Evolver(runtime.store).run({
      ...benchmark,
      candidates: [EVIDENCE_FOCUSED_GENOME],
      generations: 1,
    });
    print({
      product: "UNTIL",
      mode: "deterministic_fixture_not_llm_quality",
      initialRun: { completed: run.completed, failed: run.failed, cycles: run.cycles },
      outcomeRun: { completed: observed.completed, failed: observed.failed },
      goal: runtime.store.getGoal("goal_activation"),
      evolution: {
        promoted: evolution.promoted,
        baselineHeldout: evolution.baseline.heldout.score,
        candidateHeldout: evolution.candidate.heldout.score,
      },
      audit: runtime.store.verifyEvents(),
      state: runtime.state,
      artifacts: runtime.store.artifactsForGoal("goal_activation").map(({ id, kind, status, path }) => ({ id, kind, status, path })),
    }, flags);
  } finally {
    runtime.store.close();
  }
}

async function main() {
  const [, , command = "help", ...rest] = process.argv;
  const { positional, flags } = parseArgs(rest);
  if (command === "help" || command === "--help" || flags.help) { console.log(HELP); return; }
  if (command === "version" || command === "--version") { console.log(VERSION); return; }
  if (command === "demo") { await demo(flags); return; }

  if (command === "init") {
    const { workspace } = makeOptions(flags);
    if (flags["from-repo"]) {
      const repo = path.resolve(String(flags["from-repo"]));
      const project = await detectProject(repo);
      if (!project.testCommand) {
        throw new Error(`No test command detected in ${repo}. Author goal.policy.acceptance by hand and use --goal FILE.`);
      }
      const template = buildGoalTemplate(project, {
        id: flags.id ?? null,
        title: flags.title ?? null,
        outcome: flags.outcome ?? null,
        maxAttempts: Number(flags.attempts ?? 3),
      });
      const goalFile = path.resolve(workspace, flags.out ?? "until.goal.json");
      const checksFile = path.resolve(workspace, flags["checks-out"] ?? "until.checks.json");
      await atomicWrite(goalFile, `${JSON.stringify(template.goal, null, 2)}\n`, { fsync: true });
      await atomicWrite(checksFile, `${JSON.stringify(template.config, null, 2)}\n`, { fsync: true });
      print({
        detected: project,
        goalFile,
        checksFile,
        notes: template.notes,
        next: [
          `merge ${path.basename(checksFile)} into until.config.json under "checks"`,
          `until init --goal ${path.basename(goalFile)}`,
          "add goal.policy.releasePaths for the files a release candidate may contain",
          "add goal.policy.build.allowedPaths to restrict which files the builder may change",
        ],
      }, flags);
      return;
    }
    const runtime = await makeRuntime(flags, { deterministicOnly: true });
    try {
      const input = await loadGoal(flags.goal ?? positional[0] ?? "");
      const existing = runtime.store.getGoal(input.id);
      print({ goal: existing ?? runtime.store.addGoal(input), state: runtime.state }, flags);
    } finally { runtime.store.close(); }
    return;
  }

  if (command === "import") {
    const runtime = await makeRuntime(flags, { deterministicOnly: true });
    try {
      const summary = await importSignals(runtime.store, {
        file: flags.file ?? positional[0] ?? "",
        format: flags.format ?? "auto",
        kind: flags.kind ?? null,
        source: flags.source ?? null,
        goalId: flags.goal ?? null,
        consent: flags.consent === true || flags.consent === "true",
        dryRun: flags["dry-run"] === true || flags["dry-run"] === "true",
      });
      print(summary, flags);
    } finally { runtime.store.close(); }
    return;
  }

  if (command === "doctor") {
    const runtime = await makeRuntime(flags);
    try {
      const report = await doctor(runtime.store, {
        workspace: runtime.workspace,
        config: runtime.config,
        online: flags.online === true || flags.online === "true",
      });
      print(report, flags);
    } finally { runtime.store.close(); }
    return;
  }

  if (command === "replay") {
    const runtime = await makeRuntime(flags, { deterministicOnly: true });
    try {
      const taskId = flags.task ?? positional[0] ?? "";
      if (!taskId) throw new Error("Usage: until replay TASK_ID");
      const task = runtime.store.requeueDeadTask(taskId, {
        resetAttempts: flags["reset-attempts"] === true || flags["reset-attempts"] === "true",
      });
      print({ replayed: task }, flags);
    } finally { runtime.store.close(); }
    return;
  }

  if (command === "signal") {
    const runtime = await makeRuntime(flags, { deterministicOnly: true });
    try {
      if (positional[0] === "add") {
        const input = await readJson(path.resolve(flags.file ?? positional[1] ?? ""), "signal");
        print({ signal: runtime.store.addSignal(input) }, flags);
      } else if (positional[0] === "list") {
        const goalId = flags.goal ?? runtime.store.listGoals()[0]?.id;
        print({ signals: goalId ? runtime.store.signalsForGoal(goalId) : [] }, flags);
      } else throw new Error("Use signal add FILE or signal list");
    } finally { runtime.store.close(); }
    return;
  }

  if (["run", "start", "status", "tasks", "stop", "reset", "audit", "export", "evolve"].includes(command)) {
    const runtime = await makeRuntime(flags);
    try {
      if (command === "run" || command === "start") {
        const result = await runtime.kernel.run({
          maxCycles: Number(flags.cycles ?? 8),
          maxTasks: Number(flags.tasks ?? 1000),
          maxModelCalls: Number(flags["model-calls"] ?? 10_000),
          maxCost: flags["max-cost"] == null ? null : Number(flags["max-cost"]),
          watch: command === "start" || flags.watch === true,
          intervalMs: Number(flags.interval ?? 1000),
        });
        print(result, flags);
      } else if (command === "status") print(runtime.store.status(flags.goal ?? null), flags);
      else if (command === "tasks") print({ tasks: runtime.store.listTasks({ goalId: flags.goal ?? null }) }, flags);
      else if (command === "stop") print(runtime.store.stop(flags.reason ?? "manual CLI stop"), flags);
      else if (command === "reset") print(runtime.store.reset(), flags);
      else if (command === "audit") print(runtime.store.verifyEvents(), flags);
      else if (command === "export") {
        const output = resolveInside(runtime.workspace, flags.output ?? ".until/proof-export.json");
        const bundle = await exportProof(runtime.store, { workspace: runtime.workspace });
        await atomicWrite(output, JSON.stringify(bundle, null, 2), { fsync: true });
        print({ output, integrity: bundle.integrity.valid, audit: bundle.audit.valid, economics: bundle.economics }, flags);
      } else if (command === "evolve") {
        const benchmark = await readJson(path.resolve(flags.benchmark ?? path.join(ROOT, "benchmarks", "strategy.json")), "benchmark");
        print(new Evolver(runtime.store).run({ ...benchmark, generations: Number(flags.generations ?? 8), candidates: flags.fixture ? [EVIDENCE_FOCUSED_GENOME] : null }), flags);
      }
    } finally { runtime.store.close(); }
    return;
  }
  console.error(HELP);
  const error = new Error(`Unknown command: ${command}`);
  error.exitCode = 2;
  throw error;
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, code: error.code ?? null }));
  process.exitCode = error.exitCode ?? 1;
});
