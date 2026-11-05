import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../src/store.js";
import { Kernel } from "../src/kernel.js";
import { Agents } from "../src/agents.js";
import { Evolver, EVIDENCE_FOCUSED_GENOME } from "../src/evolve.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "proof-runs", "latest");
const publicRoot = path.join(root, "app", "public");
await rm(outRoot, { recursive: true, force: true });
await mkdir(outRoot, { recursive: true });
await mkdir(path.join(publicRoot, "fixtures"), { recursive: true });

const checks = [];
const check = (name, passed, evidence) => {
  checks.push({ name, passed: Boolean(passed), evidence });
  assert.ok(passed, `${name}: ${JSON.stringify(evidence)}`);
};

async function scenario(name) {
  const workspace = path.join(outRoot, name);
  await mkdir(workspace, { recursive: true });
  const store = new Store(path.join(workspace, ".until", "state.db"));
  const agents = new Agents({ store, workspace });
  const kernel = new Kernel({ store, agents });
  return { store, agents, kernel, workspace };
}

function addGoal(store, id = "goal_proof") {
  store.addGoal({
    id,
    title: "Reduce a real observed activation failure",
    outcome: "Increase activation ratio",
    baseline: 0.4,
    target: 0.55,
    unit: "ratio",
  });
}

function addRealSignal(store, id = "sig_real") {
  store.addSignal({
    id,
    goalId: "goal_proof",
    kind: "interview",
    source: "fixture://consenting-participant/001",
    content: "A real consenting participant abandoned activation after a repeated duplicate-entry failure.",
    consent: true,
    observedAt: "2026-11-05T00:00:00.000Z",
  });
}

const real = await scenario("real-cycle");
addGoal(real.store);
addRealSignal(real.store);
const realInitial = await real.kernel.run({ maxCycles: 8, maxTasks: 20 });
const realRelease = real.store.latestRelease("goal_proof");
const realArtifact = real.store.artifactsForGoal("goal_proof").find((item) => item.kind === "product.experiment");
check("real cycle completes six role-separated tasks", realInitial.completed === 6 && realInitial.failed === 0, {
  completed: realInitial.completed,
  failed: realInitial.failed,
});
check("builder output receives an independent passing verdict", realArtifact.status === "verified" && Boolean(real.store.verdictForArtifact(realArtifact.id).passed), {
  artifactId: realArtifact.id,
  verdict: real.store.verdictForArtifact(realArtifact.id),
});
check("release candidate is published locally with a receipt", realRelease.status === "published_candidate" && realRelease.receipt.hash === realArtifact.hash, {
  releaseId: realRelease.id,
  receipt: realRelease.receipt,
});
real.store.addSignal({
  goalId: "goal_proof",
  kind: "metric",
  source: "fixture://analytics/after-candidate",
  content: "Observed activation ratio supplied after the candidate.",
  value: 0.56,
  unit: "ratio",
  consent: true,
  observedAt: new Date(Date.now() + 60_000).toISOString(),
});
const realOutcome = await real.kernel.run({ maxCycles: 2, maxTasks: 10 });
check("post-release observation closes the declared outcome", real.store.getGoal("goal_proof").status === "achieved", {
  completed: realOutcome.completed,
  goal: real.store.getGoal("goal_proof"),
});
const realAudit = real.store.verifyEvents();
check("real-cycle event hash chain is intact", realAudit.valid, realAudit);

const realFixture = {
  format: "until-proof/v1",
  mode: "deterministic_fixture_not_llm_quality",
  title: "Real interview → verified candidate → observed outcome",
  initial: { completed: realInitial.completed, failed: realInitial.failed, cycles: realInitial.cycles },
  outcome: { completed: realOutcome.completed, failed: realOutcome.failed },
  tasks: real.store.listTasks().map(({ id, role, kind, state, attempts }) => ({ id, role, kind, state, attempts })),
  artifacts: real.store.artifactsForGoal("goal_proof").map(({ id, kind, status, hash }) => ({ id, kind, status, hash })),
  release: realRelease,
  goal: real.store.getGoal("goal_proof"),
  audit: realAudit,
};
await writeFile(path.join(publicRoot, "fixtures", "real-run.json"), JSON.stringify(realFixture, null, 2));
real.store.close();

const synthetic = await scenario("synthetic-block");
addGoal(synthetic.store);
synthetic.store.addSignal({
  goalId: "goal_proof",
  kind: "synthetic",
  source: "fixture://synthetic-persona/001",
  content: "A generated persona says it would definitely use and pay for the product.",
  consent: true,
});
const syntheticRun = await synthetic.kernel.run({ maxCycles: 8, maxTasks: 20 });
const syntheticTasks = synthetic.store.listTasks();
check("synthetic persona produces research but cannot unlock delivery", synthetic.store.getGoal("goal_proof").status === "waiting_evidence"
  && syntheticTasks.length === 1
  && !syntheticTasks.some((task) => task.kind === "delivery.build"), {
  completed: syntheticRun.completed,
  goal: synthetic.store.getGoal("goal_proof"),
  taskKinds: syntheticTasks.map((task) => task.kind),
});
const syntheticFixture = {
  format: "until-proof/v1",
  mode: "deterministic_fixture_not_llm_quality",
  title: "Synthetic persona → research guide → delivery blocked",
  initial: { completed: syntheticRun.completed, failed: syntheticRun.failed, cycles: syntheticRun.cycles },
  tasks: syntheticTasks.map(({ id, role, kind, state, attempts }) => ({ id, role, kind, state, attempts })),
  artifacts: synthetic.store.artifactsForGoal("goal_proof").map(({ id, kind, status, hash }) => ({ id, kind, status, hash })),
  goal: synthetic.store.getGoal("goal_proof"),
  audit: synthetic.store.verifyEvents(),
};
await writeFile(path.join(publicRoot, "fixtures", "synthetic-run.json"), JSON.stringify(syntheticFixture, null, 2));
synthetic.store.close();

const late = await scenario("late-completion");
addGoal(late.store);
const queued = late.store.enqueue({
  goalId: "goal_proof",
  role: "researcher",
  kind: "research.synthesize",
  contract: { goalId: "goal_proof", generation: 1 },
});
const leased = late.store.leaseNext("proof-worker");
late.store.stop("proof emergency stop");
const lateResult = late.store.completeTask(queued.task.id, leased.lease_token, { claimed: "success" });
check("late completion after stop is rejected", !lateResult.accepted && lateResult.reason === "epoch_changed", lateResult);
check("late completion cannot release dependent work", late.store.readyTasks().length === 0 && late.store.pendingOutbox().length === 0, {
  ready: late.store.readyTasks().length,
  outbox: late.store.pendingOutbox().length,
});
late.store.close();

const recovery = await scenario("lease-recovery");
addGoal(recovery.store);
const recoveryTask = recovery.store.enqueue({
  goalId: "goal_proof",
  role: "researcher",
  kind: "research.synthesize",
  contract: { goalId: "goal_proof", generation: 1 },
});
const oldLease = recovery.store.leaseNext("crashed-worker");
recovery.store.db.prepare("UPDATE tasks SET lease_until = 0 WHERE id = ?").run(recoveryTask.task.id);
const recovered = recovery.store.recoverLeases();
const rejectedOld = recovery.store.completeTask(recoveryTask.task.id, oldLease.lease_token);
check("expired lease recovers and rejects old writer", recovered.recovered === 1 && !rejectedOld.accepted, { recovered, rejectedOld });
recovery.store.close();

const evolutionStore = new Store(":memory:");
const benchmark = JSON.parse(await readFile(path.join(root, "benchmarks", "strategy.json"), "utf8"));
const evolution = new Evolver(evolutionStore).run({ ...benchmark, candidates: [EVIDENCE_FOCUSED_GENOME] });
check("evolver promotes only selection and held-out improvement", evolution.promoted
  && evolution.candidate.selection.score >= evolution.baseline.selection.score
  && evolution.candidate.heldout.score > evolution.baseline.heldout.score
  && evolution.candidate.heldout.safetyFailures === 0, {
  baselineSelection: evolution.baseline.selection.score,
  candidateSelection: evolution.candidate.selection.score,
  baselineHeldout: evolution.baseline.heldout.score,
  candidateHeldout: evolution.candidate.heldout.score,
});
evolutionStore.close();

const summary = {
  format: "until-proof/v1",
  version: "0.1.0",
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  mode: "deterministic fixtures and adversarial kernel checks; no LLM quality or business ROI claim",
  passed: checks.filter((item) => item.passed).length,
  total: checks.length,
  checks,
  metrics: {
    realCycleTasks: realInitial.completed,
    syntheticTasks: syntheticRun.completed,
    realEventCount: realAudit.count,
    heldoutBaselineCorrect: `${evolution.baseline.heldout.correct}/${evolution.baseline.heldout.total}`,
    heldoutCandidateCorrect: `${evolution.candidate.heldout.correct}/${evolution.candidate.heldout.total}`,
  },
};
await writeFile(path.join(publicRoot, "proof.json"), JSON.stringify(summary, null, 2));
await writeFile(path.join(outRoot, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
