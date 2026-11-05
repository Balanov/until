import { assertObject, assertText } from "./util.js";

export const REAL_SIGNAL_KINDS = Object.freeze([
  "interview",
  "metric",
  "incident",
  "payment",
  "observed",
  "support",
]);

export const SIGNAL_KINDS = Object.freeze([
  ...REAL_SIGNAL_KINDS,
  "reported",
  "inferred",
  "synthetic",
]);

export const TASK_RULES = Object.freeze({
  "research.synthesize": { role: "researcher", capability: "opportunity.propose" },
  "product.contract": { role: "owner", capability: "contract.create" },
  "delivery.build": { role: "builder", capability: "artifact.build" },
  "quality.verify": { role: "verifier", capability: "verdict.create" },
  "release.prepare": { role: "release", capability: "release.candidate" },
  "outcome.observe": { role: "analyst", capability: "outcome.observe" },
});

export const ROLE_CAPABILITIES = Object.freeze({
  researcher: ["signals.read", "opportunity.propose", "artifact.research"],
  owner: ["signals.read", "opportunity.prioritize", "contract.create"],
  builder: ["contract.read", "artifact.build"],
  verifier: ["artifact.read", "check.execute", "verdict.create"],
  release: ["artifact.read", "release.candidate", "outbox.write"],
  analyst: ["signals.read", "artifact.read", "outcome.observe"],
  evolver: ["eval.read", "strategy.candidate"],
});

export const CHECK_TYPES = Object.freeze([
  "file_exists",
  "sha256",
  "json_field",
  "contains",
  "command_profile",
]);

export const OUTBOX_ACTIONS = Object.freeze(["artifact.publish"]);

export function isRealSignal(signal) {
  return Boolean(
    signal
    && REAL_SIGNAL_KINDS.includes(signal.kind)
    && signal.consent === 1
    && typeof signal.source === "string"
    && signal.source.trim().length > 0,
  );
}

export function realEvidence(signals, ids = null) {
  const allowed = ids ? new Set(ids) : null;
  return signals.filter((signal) => (!allowed || allowed.has(signal.id)) && isRealSignal(signal));
}

export function assertTaskContract(kind, role, contract) {
  const rule = TASK_RULES[kind];
  if (!rule) throw new Error(`Unknown task kind: ${kind}`);
  if (rule.role !== role) throw new Error(`Role ${role} cannot execute ${kind}`);
  if (!ROLE_CAPABILITIES[role]?.includes(rule.capability)) {
    throw new Error(`Role ${role} lacks ${rule.capability}`);
  }
  assertObject(contract, "Task contract");
  assertText(contract.goalId, "contract.goalId", { max: 200 });
  return contract;
}

export function assertRoleCapability(role, capability) {
  if (!ROLE_CAPABILITIES[role]?.includes(capability)) {
    throw new Error(`Role ${role} lacks capability ${capability}`);
  }
}

export function assertCheck(check) {
  assertObject(check, "Acceptance check");
  if (!CHECK_TYPES.includes(check.type)) throw new Error(`Unknown check type: ${check.type}`);
  if (check.type === "json_field") {
    assertText(check.field, "check.field", { max: 200 });
    if (check.field.split(".").some((key) => ["__proto__", "prototype", "constructor"].includes(key))) {
      throw new Error("json_field contains an unsafe path");
    }
    if (!("equals" in check)) throw new Error("json_field requires equals");
  }
  if (check.type === "contains") assertText(check.text, "check.text", { max: 10_000 });
  if (check.type === "sha256") assertText(check.hash, "check.hash", { min: 64, max: 64 });
  if (check.type === "command_profile") assertText(check.profile, "check.profile", { max: 100 });
  return check;
}

export function assertOutboxAction(action) {
  if (!OUTBOX_ACTIONS.includes(action)) throw new Error(`Unknown outbox action: ${action}`);
}

export function evaluateEvidenceGate(signals, evidenceIds, { forRelease = false } = {}) {
  const selected = Array.isArray(evidenceIds) ? evidenceIds : [];
  if (selected.length === 0) return { allowed: false, reason: "evidence_ids_empty", realCount: 0 };
  const selectedSignals = signals.filter((signal) => selected.includes(signal.id));
  if (selectedSignals.length !== new Set(selected).size) {
    return { allowed: false, reason: "evidence_not_found", realCount: 0 };
  }
  const real = realEvidence(selectedSignals);
  if (real.length === 0) return { allowed: false, reason: "real_evidence_required", realCount: 0 };
  if (forRelease && selectedSignals.some((signal) => signal.kind === "synthetic")) {
    return { allowed: false, reason: "synthetic_cannot_release", realCount: real.length };
  }
  return { allowed: true, reason: null, realCount: real.length };
}
