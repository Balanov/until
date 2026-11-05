import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCheck,
  assertTaskContract,
  evaluateEvidenceGate,
  isRealSignal,
} from "../src/policy.js";
import { canonicalJson, resolveInside, sha256 } from "../src/util.js";

const real = { id: "real", kind: "interview", source: "test://person", consent: 1 };
const synthetic = { id: "synthetic", kind: "synthetic", source: "test://persona", consent: 1 };

test("real evidence requires a known kind, source and consent", () => {
  assert.equal(isRealSignal(real), true);
  assert.equal(isRealSignal({ ...real, consent: 0 }), false);
  assert.equal(isRealSignal({ ...real, source: "" }), false);
  assert.equal(isRealSignal(synthetic), false);
});

test("synthetic-only evidence cannot unlock a contract", () => {
  assert.deepEqual(evaluateEvidenceGate([synthetic], ["synthetic"]), {
    allowed: false,
    reason: "real_evidence_required",
    realCount: 0,
  });
});

test("synthetic evidence cannot enter a release evidence set", () => {
  const result = evaluateEvidenceGate([real, synthetic], ["real", "synthetic"], { forRelease: true });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "synthetic_cannot_release");
});

test("unknown or fabricated evidence IDs fail closed", () => {
  const result = evaluateEvidenceGate([real], ["missing"]);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "evidence_not_found");
});

test("a role cannot execute another role's task", () => {
  assert.throws(
    () => assertTaskContract("quality.verify", "builder", { goalId: "g" }),
    /cannot execute/,
  );
});

test("unknown task kinds fail closed", () => {
  assert.throws(() => assertTaskContract("admin.self_grant", "builder", { goalId: "g" }), /Unknown task kind/);
});

test("acceptance checks reject unknown check types", () => {
  assert.throws(() => assertCheck({ type: "trust_me" }), /Unknown check type/);
});

test("command checks require a named profile", () => {
  assert.throws(() => assertCheck({ type: "command_profile" }), /profile/);
});

test("canonical JSON is stable across object key order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  assert.equal(sha256({ b: 1, a: 2 }), sha256({ a: 2, b: 1 }));
});

test("workspace path traversal is rejected", () => {
  assert.throws(() => resolveInside(process.cwd(), "../outside"), /escapes workspace/);
});
