import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../src/util.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "app", "public");

test("published comparison preserves every raw trial, hash and honest limitation", async () => {
  const comparison = JSON.parse(await readFile(path.join(publicRoot, "comparison.json"), "utf8"));
  assert.equal(comparison.format, "until-comparison/v1");
  assert.equal(comparison.trials.length, 48);
  assert.equal(comparison.summaries.length, 8);
  const summary = (label, system) => comparison.summaries.find((item) => item.label === label && item.suite === "heldout" && item.system === system);
  assert.equal(summary("v0.1.0-baseline", "until").accepted, 0);
  assert.equal(summary("v0.2.0-candidate", "until").accepted, 6);
  assert.equal(summary("v0.2.0-candidate", "direct").accepted, 6);
  assert.ok(comparison.directSpeedAdvantage > 3.2 && comparison.directSpeedAdvantage < 3.3);
  assert.match(comparison.interpretation.join(" "), /direct baseline is faster/);
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  };
  for (const item of comparison.summaries) {
    const trials = comparison.trials.filter((trial) => trial.label === item.label && trial.suite === item.suite && trial.system === item.system);
    assert.equal(trials.length, 6);
    assert.equal(item.accepted, trials.filter((trial) => trial.accepted).length);
    assert.equal(item.medianWallMs, median(trials.map((trial) => trial.wallMs)), `${item.label}/${item.suite}/${item.system}`);
    assert.equal(item.medianModelCalls, median(trials.map((trial) => trial.modelCalls)), `${item.label}/${item.suite}/${item.system}`);
  }
  for (const trial of comparison.trials) {
    const trace = path.resolve(publicRoot, trial.trace);
    assert.ok(trace.startsWith(`${path.join(publicRoot, "live")}${path.sep}`), "trace must stay in public/live");
    const result = JSON.parse(await readFile(path.join(trace, "result.json"), "utf8"));
    const raw = await readFile(path.join(trace, "responses.jsonl"), "utf8");
    const responses = raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(result.accepted, trial.accepted, trial.trace);
    assert.equal(result.system, trial.system, trial.trace);
    assert.equal(responses.length, trial.modelCalls, trial.trace);
    assert.equal(sha256(raw), trial.rawResponsesSha256, trial.trace);
    assert.ok(responses.every((response) => response.httpStatus !== 200 || typeof response.content === "string"), trial.trace);
    if (trial.system === "until" && trial.accepted) {
      assert.equal(result.audit.valid, true, trial.trace);
      assert.equal(sha256(result.artifact.content), result.artifact.hash, trial.trace);
      assert.equal(result.release.receipt.hash, result.artifact.hash, trial.trace);
    }
  }
  async function assertNoDatabases(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.ok(!/^state\.db(?:-(?:shm|wal))?$/.test(entry.name), `database leaked: ${entry.name}`);
      if (entry.isDirectory()) await assertNoDatabases(path.join(directory, entry.name));
    }
  }
  await assertNoDatabases(path.join(publicRoot, "live"));
});
