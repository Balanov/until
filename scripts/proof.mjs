import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../src/store.js";
import { Kernel } from "../src/kernel.js";
import { Agents } from "../src/agents.js";
import { Evolver, EVIDENCE_FOCUSED_GENOME } from "../src/evolve.js";
import { spawnSync } from "node:child_process";
import { actualNodeBinary } from "./node-binary.mjs";

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

const repository = await scenario("repository-cycle");
await mkdir(path.join(repository.workspace, "src"), { recursive: true });
await mkdir(path.join(repository.workspace, "scripts"), { recursive: true });
const initialSource = `export function activationSteps() {\n  return ["account", "duplicate-entry", "duplicate-entry", "profile"];\n}\n`;
const acceptedSource = `export function activationSteps() {\n  return ["account", "profile"];\n}\n`;
await writeFile(path.join(repository.workspace, "src", "activation.js"), initialSource);
await writeFile(path.join(repository.workspace, "scripts", "verify.mjs"), `import assert from "node:assert/strict";\nimport { activationSteps } from "../src/activation.js";\nassert.deepEqual(activationSteps(), ["account", "profile"]);\nconsole.log("ACTIVATION_TEST_OK");\n`);
const builderSource = `import { writeFile } from "node:fs/promises";\nlet input = "";\nprocess.stdin.on("data", (chunk) => { input += chunk; });\nprocess.stdin.on("end", async () => {\n  JSON.parse(input);\n  await writeFile("src/activation.js", ${JSON.stringify(acceptedSource)}, "utf8");\n  process.stdout.write(JSON.stringify({ type: "repository_change", summary: "Removed the observed duplicate activation step", repositoryChange: true }));\n});\n`;
const builderPath = path.join(repository.workspace, "builder.mjs");
await writeFile(builderPath, builderSource);
const beforeTest = spawnSync(actualNodeBinary(), ["scripts/verify.mjs"], { cwd: repository.workspace, encoding: "utf8" });
repository.agents.builderProfile = { command: actualNodeBinary(), args: [builderPath], timeoutMs: 30_000 };
repository.agents.sandboxConfirmed = true;
repository.agents.commandProfiles = {
  repositoryTest: { command: actualNodeBinary(), args: ["scripts/verify.mjs"], timeoutMs: 30_000 },
};
repository.store.addGoal({
  id: "goal_proof",
  title: "Remove the observed duplicate activation step",
  outcome: "Increase completed activation",
  baseline: 0.4,
  target: 0.55,
  unit: "ratio",
  policy: {
    acceptance: [
      { type: "file_exists", path: "src/activation.js" },
      { type: "json_field", field: "implementation.repositoryChange", equals: true },
      { type: "command_profile", profile: "repositoryTest", expect: { contains: "ACTIVATION_TEST_OK" } },
    ],
    releasePaths: ["src/activation.js", "scripts/verify.mjs"],
  },
});
repository.store.addSignal({
  id: "sig_repository",
  goalId: "goal_proof",
  kind: "incident",
  source: "fixture://observed-product/duplicate-entry",
  content: "A real observed activation run repeated the same data-entry step twice.",
  consent: true,
  observedAt: "2026-11-05T00:00:00.000Z",
});
const repositoryRun = await repository.kernel.run({ maxCycles: 8, maxTasks: 20 });
const afterTest = spawnSync(actualNodeBinary(), ["scripts/verify.mjs"], { cwd: repository.workspace, encoding: "utf8" });
check("repository regression fails before the change and passes after it", beforeTest.status !== 0 && afterTest.status === 0 && afterTest.stdout.includes("ACTIVATION_TEST_OK"), {
  before: { status: beforeTest.status, output: `${beforeTest.stdout}${beforeTest.stderr}`.slice(-1000) },
  after: { status: afterTest.status, output: afterTest.stdout.trim() },
});
check("repository change completes the same six-role product cycle", repositoryRun.completed === 6 && repositoryRun.failed === 0, {
  completed: repositoryRun.completed,
  failed: repositoryRun.failed,
});
const repositoryArtifact = repository.store.artifactsForGoal("goal_proof").find((item) => item.kind === "product.experiment");
const repositoryVerdict = repository.store.verdictForArtifact(repositoryArtifact.id);
check("independent verifier runs the real repository test", repositoryVerdict.passed === 1
  && repositoryVerdict.checks.find((item) => item.type === "command_profile")?.passed === true, repositoryVerdict);
const repositoryRelease = repository.store.latestRelease("goal_proof");
const candidateSourcePath = path.join(repository.workspace, ".until", "releases", repositoryRelease.id, "workspace", "src", "activation.js");
const candidateSource = await readFile(candidateSourcePath, "utf8");
await writeFile(path.join(repository.workspace, "src", "activation.js"), initialSource);
const candidateAfterWorkspaceEdit = await readFile(candidateSourcePath, "utf8");
check("release candidate packages actual code and remains immutable", repositoryRelease.status === "published_candidate"
  && repositoryRelease.receipt.workspace.files === 2
  && candidateSource === acceptedSource
  && candidateAfterWorkspaceEdit === acceptedSource, {
  releaseId: repositoryRelease.id,
  workspace: repositoryRelease.receipt.workspace,
  candidateHash: repositoryRelease.receipt.workspace.hash,
});
const repositoryFixture = {
  format: "until-repository-proof/v1",
  mode: "deterministic_external_builder_and_real_node_test_not_llm_quality",
  title: "Observed product issue → code change → independent test → immutable repository candidate",
  beforeTest: { status: beforeTest.status, output: `${beforeTest.stdout}${beforeTest.stderr}`.slice(-1000) },
  afterTest: { status: afterTest.status, output: afterTest.stdout.trim() },
  initial: { completed: repositoryRun.completed, failed: repositoryRun.failed, cycles: repositoryRun.cycles },
  tasks: repository.store.listTasks().map(({ id, role, kind, state, attempts }) => ({ id, role, kind, state, attempts })),
  verdict: repositoryVerdict,
  release: repository.store.getRelease(repositoryRelease.id),
  initialSource,
  acceptedSource,
  candidateSource: candidateAfterWorkspaceEdit,
  audit: repository.store.verifyEvents(),
};
await writeFile(path.join(publicRoot, "fixtures", "repository-run.json"), JSON.stringify(repositoryFixture, null, 2));
repository.store.close();

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
  version: "0.2.0",
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  mode: "deterministic fixtures and adversarial kernel checks; no LLM quality or business ROI claim",
  passed: checks.filter((item) => item.passed).length,
  total: checks.length,
  checks,
  metrics: {
    realCycleTasks: realInitial.completed,
    syntheticTasks: syntheticRun.completed,
    repositoryCycleTasks: repositoryRun.completed,
    repositoryFilesReleased: repositoryRelease.receipt.workspace.files,
    repositoryRegressionBefore: beforeTest.status,
    repositoryRegressionAfter: afterTest.status,
    realEventCount: realAudit.count,
    heldoutBaselineCorrect: `${evolution.baseline.heldout.correct}/${evolution.baseline.heldout.total}`,
    heldoutCandidateCorrect: `${evolution.candidate.heldout.correct}/${evolution.candidate.heldout.total}`,
  },
};
await writeFile(path.join(publicRoot, "proof.json"), JSON.stringify(summary, null, 2));
await writeFile(path.join(outRoot, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
