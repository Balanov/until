import { clamp } from "./util.js";

export const DEFAULT_GENOME = Object.freeze({
  impact: 0.35,
  confidence: 0.25,
  evidence: 0.25,
  effortPenalty: 0.15,
  researchDepth: 1,
});

export const EVIDENCE_FOCUSED_GENOME = Object.freeze({
  impact: 0.2,
  confidence: 0.15,
  evidence: 0.45,
  effortPenalty: 0.2,
  researchDepth: 2,
});

function validateGenome(genome) {
  for (const key of ["impact", "confidence", "evidence", "effortPenalty"]) {
    if (!Number.isFinite(genome[key]) || genome[key] < 0 || genome[key] > 1) throw new Error(`Invalid genome weight: ${key}`);
  }
  if (!Number.isInteger(genome.researchDepth) || genome.researchDepth < 1 || genome.researchDepth > 3) {
    throw new Error("researchDepth must be 1–3");
  }
  return genome;
}

export function opportunityScore(item, genome) {
  validateGenome(genome);
  for (const key of ["impact", "confidence", "evidence", "effort"]) {
    if (!Number.isFinite(item[key]) || item[key] < 0 || item[key] > 1) throw new Error(`Invalid opportunity ${key}`);
  }
  const positive = genome.impact + genome.confidence + genome.evidence;
  if (positive === 0) return -item.effort * genome.effortPenalty;
  return (
    item.impact * genome.impact
    + item.confidence * genome.confidence
    + item.evidence * genome.evidence
  ) / positive - item.effort * genome.effortPenalty;
}

export function evaluateGenome(genome, dataset, { forRelease = true } = {}) {
  if (!dataset || !Array.isArray(dataset.cases) || dataset.cases.length === 0) throw new Error("Evaluation dataset requires cases");
  const details = [];
  let correct = 0;
  let safetyFailures = 0;
  for (const testCase of dataset.cases) {
    if (!Array.isArray(testCase.opportunities) || testCase.opportunities.length < 2) throw new Error("Each case needs at least two opportunities");
    const ranked = testCase.opportunities
      .map((item) => ({ id: item.id, kind: item.kind ?? "observed", score: opportunityScore(item, genome) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const selected = ranked[0];
    const hit = selected.id === testCase.preferred;
    if (hit) correct += 1;
    if (forRelease && testCase.delivery !== false && selected.kind === "synthetic") safetyFailures += 1;
    details.push({ caseId: testCase.id, selected: selected.id, preferred: testCase.preferred, hit, ranked });
  }
  return {
    score: correct / dataset.cases.length,
    correct,
    total: dataset.cases.length,
    safetyFailures,
    details,
  };
}

function xorshift(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function mutateGenome(parent, random) {
  validateGenome(parent);
  const child = {};
  for (const key of ["impact", "confidence", "evidence", "effortPenalty"]) {
    child[key] = clamp(parent[key] + (random() - 0.5) * 0.3, 0.02, 1);
  }
  child.researchDepth = clamp(parent.researchDepth + (random() > 0.7 ? (random() > 0.5 ? 1 : -1) : 0), 1, 3);
  return child;
}

export class Evolver {
  constructor(store) {
    this.store = store;
  }

  run({ selection, heldout, generations = 8, seed = 42, candidates = null, baselineGenome = DEFAULT_GENOME }) {
    if (!Number.isInteger(generations) || generations < 1 || generations > 1000) throw new Error("generations must be 1–1000");
    if (candidates && (!Array.isArray(candidates) || candidates.length === 0)) throw new Error("candidates must be a non-empty array");
    const baseline = this.store.addStrategy({ genome: baselineGenome, status: "active" });
    const baselineSelection = evaluateGenome(baselineGenome, selection);
    const baselineHeldout = evaluateGenome(baselineGenome, heldout);
    this.store.addEvaluation({ strategyId: baseline.id, dataset: "selection", score: baselineSelection.score, safetyFailures: baselineSelection.safetyFailures, raw: baselineSelection });
    this.store.addEvaluation({ strategyId: baseline.id, dataset: "heldout", score: baselineHeldout.score, safetyFailures: baselineHeldout.safetyFailures, raw: baselineHeldout });
    let bestSelectionScore = baselineSelection.score;
    let finalists = [{ genome: baselineGenome, evaluation: baselineSelection, heldout: baselineHeldout, id: baseline.id }];
    const random = xorshift(seed);
    const count = candidates?.length ?? generations;
    for (let index = 0; index < count; index += 1) {
      const parent = finalists.at(-1);
      const genome = candidates?.[index] ?? mutateGenome(parent.genome, random);
      validateGenome(genome);
      const candidate = this.store.addStrategy({ parentId: parent.id, genome, status: "candidate" });
      const evaluation = evaluateGenome(genome, selection);
      this.store.addEvaluation({ strategyId: candidate.id, dataset: "selection", score: evaluation.score, safetyFailures: evaluation.safetyFailures, raw: evaluation });
      const item = { genome, evaluation, id: candidate.id, heldout: null };
      if (evaluation.safetyFailures > 0 || evaluation.score < bestSelectionScore) {
        this.store.updateStrategy(candidate.id, "rejected_selection");
      } else {
        if (evaluation.score > bestSelectionScore) {
          for (const previous of finalists) {
            if (previous.id !== baseline.id) this.store.updateStrategy(previous.id, "rejected_selection");
          }
          finalists = [];
          bestSelectionScore = evaluation.score;
        }
        finalists.push(item);
      }
    }
    for (const finalist of finalists) {
      if (finalist.id === baseline.id) continue;
      finalist.heldout = evaluateGenome(finalist.genome, heldout);
      this.store.addEvaluation({ strategyId: finalist.id, dataset: "heldout", score: finalist.heldout.score, safetyFailures: finalist.heldout.safetyFailures, raw: finalist.heldout });
    }
    const improving = finalists
      .filter((item) => item.id !== baseline.id
        && item.evaluation.score >= baselineSelection.score
        && item.heldout.score > baselineHeldout.score
        && item.evaluation.safetyFailures === 0
        && item.heldout.safetyFailures === 0)
      .sort((a, b) => b.heldout.score - a.heldout.score || b.evaluation.score - a.evaluation.score);
    const bestAlternative = finalists
      .filter((item) => item.id !== baseline.id)
      .sort((a, b) => b.heldout.score - a.heldout.score || b.evaluation.score - a.evaluation.score)[0];
    const selected = improving[0] ?? bestAlternative ?? { genome: baselineGenome, evaluation: baselineSelection, heldout: baselineHeldout, id: baseline.id };
    const promoted = improving.length > 0 && selected.id !== baseline.id;
    for (const finalist of finalists) {
      if (finalist.id === baseline.id) continue;
      this.store.updateStrategy(finalist.id, promoted && finalist.id === selected.id ? "active" : "rejected_heldout");
    }
    if (promoted) this.store.updateStrategy(baseline.id, "superseded");
    return {
      promoted,
      baselineId: baseline.id,
      selectedId: selected.id,
      championId: promoted ? selected.id : baseline.id,
      baseline: { genome: baselineGenome, selection: baselineSelection, heldout: baselineHeldout },
      candidate: { genome: selected.genome, selection: selected.evaluation, heldout: selected.heldout },
      candidatesEvaluated: count,
      finalistsEvaluatedOnHeldout: finalists.length,
      note: "Fixture evaluation demonstrates the selection mechanism, not real-world product improvement.",
    };
  }
}
