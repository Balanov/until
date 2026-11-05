import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../src/util.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "app/public");
const protocol = JSON.parse(await readFile(path.join(root, "benchmarks/live-protocol.json"), "utf8"));
const fixtures = JSON.parse(await readFile(path.join(root, "benchmarks/live-tasks.json"), "utf8"));
const labels = ["v0.1.0-baseline", "v0.2.0-candidate"];
const trials = [];

function median(values) {
  if (!values.length) throw new Error("Cannot calculate an empty median");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

for (const label of labels) {
  const environmentFile = path.join(publicRoot, "live", label, `heldout-${protocol.arms[0]}.json`);
  const environment = JSON.parse(await readFile(environmentFile, "utf8"));
  for (const suite of protocol.suites) {
    for (const testCase of fixtures.suites[suite]) {
      for (const system of protocol.arms) {
        const directory = path.join(publicRoot, "live", label, suite, testCase.id);
        for (let iteration = 1; iteration <= protocol.repeats; iteration += 1) {
          const id = `${system}-${iteration}`;
          const trace = path.join(directory, id);
          const result = JSON.parse(await readFile(path.join(trace, "result.json"), "utf8"));
          if (result.system !== system) throw new Error(`Wrong arm in ${trace}`);
          const rawFile = path.join(trace, "responses.jsonl");
          const raw = await readFile(rawFile, "utf8");
          const responses = raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
          if (responses.length !== result.modelCalls) throw new Error(`Model-call trace mismatch in ${trace}`);
          if (responses.some((response) => response.httpStatus === 200 && typeof response.content !== "string")) {
            throw new Error(`Missing raw model content in ${trace}`);
          }
          trials.push({
            label, suite, case: testCase.id, iteration, system,
            accepted: result.accepted,
            rejectionReasons: result.rejectionReasons,
            wallMs: result.wallMs,
            modelCalls: result.modelCalls,
            attempts: result.attempts,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            providerCharges: result.providerCharges,
            trace: path.relative(publicRoot, trace).replaceAll("\\", "/"),
            rawResponsesSha256: sha256(raw),
          });
          await rm(path.join(trace, "state.db"), { force: true });
          await rm(path.join(trace, "state.db-shm"), { force: true });
          await rm(path.join(trace, "state.db-wal"), { force: true });
          await rm(path.join(trace, ".until"), { recursive: true, force: true });
        }
      }
    }
  }
  environment.trials = undefined;
}

const summaries = [];
for (const label of labels) {
  for (const suite of protocol.suites) {
    for (const system of protocol.arms) {
      const selected = trials.filter((trial) => trial.label === label && trial.suite === suite && trial.system === system);
      const accepted = selected.filter((trial) => trial.accepted).length;
      summaries.push({
        label, suite, system,
        accepted, total: selected.length,
        acceptanceRate: accepted / selected.length,
        medianWallMs: median(selected.map((trial) => trial.wallMs)),
        minWallMs: Math.min(...selected.map((trial) => trial.wallMs)),
        maxWallMs: Math.max(...selected.map((trial) => trial.wallMs)),
        medianModelCalls: median(selected.map((trial) => trial.modelCalls)),
        medianTotalTokens: median(selected.map((trial) => trial.inputTokens + trial.outputTokens)),
        totalModelCalls: selected.reduce((sum, trial) => sum + trial.modelCalls, 0),
        totalInputTokens: selected.reduce((sum, trial) => sum + trial.inputTokens, 0),
        totalOutputTokens: selected.reduce((sum, trial) => sum + trial.outputTokens, 0),
        providerChargesPerAccepted: accepted ? selected.reduce((sum, trial) => sum + trial.providerCharges, 0) / accepted : null,
        providerChargesScope: "Local provider charges only. Hardware and electricity are not measured.",
      });
    }
  }
}

const currentUntil = summaries.find((item) => item.label === labels[1] && item.suite === "heldout" && item.system === "until");
const currentDirect = summaries.find((item) => item.label === labels[1] && item.suite === "heldout" && item.system === "direct");
const candidateMetadata = JSON.parse(await readFile(path.join(publicRoot, "live", labels[1], "heldout-until.json"), "utf8"));
const historicalSourceFiles = ["src/agents.js", "src/model.js", "src/store.js", "src/kernel.js", "bin/until.mjs", "scripts/compare.mjs"];
const result = {
  format: "until-comparison/v1",
  generatedAt: new Date().toISOString(),
  protocol,
  fixtureHash: sha256(await readFile(path.join(root, "benchmarks/live-tasks.json"), "utf8")),
  protocolHash: sha256(await readFile(path.join(root, "benchmarks/live-protocol.json"), "utf8")),
  model: protocol.model,
  environment: candidateMetadata.environment,
  sourceFiles: candidateMetadata.sourceFiles ?? historicalSourceFiles,
  sourceHash: candidateMetadata.sourceHash,
  summaries,
  trials,
  directSpeedAdvantage: currentUntil.medianWallMs / currentDirect.medianWallMs,
  directCallAdvantage: currentUntil.medianModelCalls / currentDirect.medianModelCalls,
  interpretation: [
    "This is a structured digital-deliverable test, not a software-engineering, business-outcome or team-replacement benchmark.",
    "Both current arms use the same strict structured-output improvement. The direct prompt text is unchanged between baseline and current runs.",
    "The current direct baseline is faster and uses fewer calls on these bounded tasks. UNTIL adds durable state, role separation, independent acceptance, release receipts and an outer product loop.",
    "No competitor performance ranking is claimed. Competitor capabilities are documented separately from this paired same-model test.",
    "Every trial is included. No failed run or outlier is removed.",
  ],
};
await writeFile(path.join(publicRoot, "comparison.json"), JSON.stringify(result, null, 2));
await writeFile(path.join(publicRoot, "live-protocol.json"), JSON.stringify(protocol, null, 2));
await writeFile(path.join(publicRoot, "live-tasks.json"), JSON.stringify(fixtures, null, 2));
console.log(JSON.stringify({ summaries, directSpeedAdvantage: result.directSpeedAdvantage, trials: trials.length }, null, 2));
