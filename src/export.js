import { readFile } from "node:fs/promises";
import { resolveInside, sha256 } from "./util.js";

export async function exportProof(store, { workspace = process.cwd() } = {}) {
  const artifacts = store.db.prepare("SELECT * FROM artifacts ORDER BY created_at").all();
  const integrity = [];
  for (const artifact of artifacts) {
    let currentHash = sha256(artifact.content ?? "");
    let error = null;
    if (artifact.path) {
      try { currentHash = sha256(await readFile(resolveInside(workspace, artifact.path), "utf8")); }
      catch (caught) { error = caught.message; }
    }
    integrity.push({ artifactId: artifact.id, expectedHash: artifact.hash, currentHash, valid: !error && currentHash === artifact.hash, error });
  }
  const responses = store.modelResponses().map((response) => ({
    ...response,
    valid: sha256(response.content) === response.hash,
  }));
  const tables = {};
  for (const name of ["goals", "signals", "opportunities", "tasks", "verdicts", "releases", "outbox", "events", "model_calls", "strategies", "evaluations"]) {
    tables[name] = store.db.prepare(`SELECT * FROM ${name}`).all();
  }
  return {
    format: "until-proof-export/v1",
    generatedAt: new Date().toISOString(),
    scope: "Local candidate evidence, not proof of production deployment, causal business impact or universal team replacement.",
    rawResponsesIncluded: responses.length > 0,
    rawResponseNotice: responses.length > 0 ? "Raw model responses can contain data derived from signals. Review before sharing." : "Response tracing was disabled or no model was called.",
    economics: store.economics(),
    audit: store.verifyEvents(),
    integrity: { valid: integrity.every((item) => item.valid) && responses.every((item) => item.valid), artifacts: integrity, modelResponses: responses },
    ...tables,
  };
}
