import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runtime } from "./helpers.mjs";
import {
  DEFAULT_GENOME,
  EVIDENCE_FOCUSED_GENOME,
  Evolver,
  evaluateGenome,
  mutateGenome,
} from "../src/evolve.js";

async function benchmark() {
  return JSON.parse(await readFile(new URL("../benchmarks/strategy.json", import.meta.url), "utf8"));
}

test("evolution promotes only a selection and held-out improvement", async (t) => {
  const { store } = await runtime(t);
  const data = await benchmark();
  const result = new Evolver(store).run({ ...data, candidates: [EVIDENCE_FOCUSED_GENOME] });
  assert.equal(result.baseline.heldout.score, 0);
  assert.equal(result.candidate.heldout.score, 1);
  assert.equal(result.promoted, true);
  assert.equal(store.getStrategy(result.championId).status, "active");
  assert.equal(store.getStrategy(result.baselineId).status, "superseded");
});

test("a held-out regression cannot be promoted", async (t) => {
  const { store } = await runtime(t);
  const selection = {
    cases: [{
      id: "selection",
      preferred: "real",
      opportunities: [
        { id: "real", impact: 0.3, confidence: 0.4, evidence: 1, effort: 0.1, kind: "metric" },
        { id: "synthetic", impact: 1, confidence: 1, evidence: 0, effort: 0, kind: "synthetic" },
      ],
    }],
  };
  const heldout = {
    cases: [{
      id: "heldout",
      preferred: "not-the-selected-item",
      opportunities: [
        { id: "real", impact: 0.3, confidence: 0.4, evidence: 1, effort: 0.1, kind: "metric" },
        { id: "other", impact: 0, confidence: 0, evidence: 0, effort: 1, kind: "metric" },
      ],
    }],
  };
  const result = new Evolver(store).run({ selection, heldout, candidates: [EVIDENCE_FOCUSED_GENOME] });
  assert.equal(result.candidate.selection.score, 1);
  assert.equal(result.candidate.heldout.score, 0);
  assert.equal(result.promoted, false);
});

test("a synthetic-selecting genome triggers a safety failure", () => {
  const dataset = {
    cases: [{
      id: "safety",
      preferred: "real",
      opportunities: [
        { id: "real", impact: 0.1, confidence: 0.1, evidence: 1, effort: 0.2, kind: "interview" },
        { id: "synthetic", impact: 1, confidence: 1, evidence: 0, effort: 0, kind: "synthetic" },
      ],
    }],
  };
  const genome = { impact: 1, confidence: 0, evidence: 0, effortPenalty: 0, researchDepth: 1 };
  const result = evaluateGenome(genome, dataset);
  assert.equal(result.safetyFailures, 1);
});

test("mutations stay inside the declared genome bounds", () => {
  const child = mutateGenome(DEFAULT_GENOME, () => 0.99);
  for (const key of ["impact", "confidence", "evidence", "effortPenalty"]) {
    assert.ok(child[key] >= 0 && child[key] <= 1);
  }
  assert.ok(child.researchDepth >= 1 && child.researchDepth <= 3);
});
