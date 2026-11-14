import {
  applyEdits,
  diffManifests,
  restoreFromSnapshot,
  snapshotWorkspace,
} from "./workspace.js";

const MAX_FEEDBACK_CHARS = 8_000;

/**
 * Test-driven repair loop.
 *
 * This is the difference between "an agent produced a file" and "an agent changed
 * the product until the product's own checks passed". The loop is:
 *
 *   propose change → apply it safely → run the authoritative check → if it fails,
 *   hand the failure back to the proposer and try again → on exhaustion, restore
 *   the workspace exactly as it was found.
 *
 * The proposer may be a deterministic fixture, a hosted model or an external
 * coding harness. The loop itself is deterministic and is what the kernel owns.
 */
export async function runRepairLoop({
  workspace,
  propose,
  verify,
  maxAttempts = 3,
  allow = null,
  excludes = undefined,
  onAttempt = null,
}) {
  if (typeof propose !== "function") throw new Error("A repair loop requires a propose function");
  if (typeof verify !== "function") throw new Error("A repair loop requires a verify function");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new Error("maxAttempts must be 1–20");
  }

  const before = await snapshotWorkspace(workspace, { captureContent: true });
  const attempts = [];
  let feedback = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const stateBefore = await snapshotWorkspace(workspace);
    let proposal = null
    let proposalError = null
    try {
      proposal = await propose({ attempt, feedback, changedFiles: attempts.flatMap((item) => item.changedFiles) });
    } catch (error) {
      // A builder that crashes or times out is a failed attempt, not a dead loop.
      // The reason is kept so the run can be explained afterwards.
      proposalError = String(error?.message ?? error).slice(0, 4000);
    }

    // Only an explicit decline stops the loop. An empty edit list means "I changed
    // nothing this time" — the check still fails and the failure output is the
    // most useful thing we can hand back, so the builder gets another attempt.
    if (!proposalError && (!proposal || proposal.declined === true)) {
      const result = {
        passed: false,
        reason: "declined_by_builder",
        attempts,
        workspaceRestored: false,
        manifest: before,
        changes: { added: [], modified: [], removed: [] },
        verification: null,
        notes: proposal?.notes ?? null,
      };
      if (onAttempt) await onAttempt({ attempt, ...result });
      return result;
    }

    let changedFiles = [];
    if (!proposalError && Array.isArray(proposal.edits) && proposal.edits.length) {
      const applied = await applyEdits(workspace, proposal.edits, { allow, excludes });
      changedFiles = applied.applied.map((item) => item.path);
    }
    const stateAfter = await snapshotWorkspace(workspace);
    if (!changedFiles.length) {
      const observed = diffManifests(stateBefore, stateAfter);
      changedFiles = [...observed.added, ...observed.modified];
    }

    // A proposer that edits the workspace itself must obey the same allowlist.
    if (allow && allow.length) {
      const permitted = changedFiles.every((file) => allow.some((entry) => {
        const candidate = String(entry).replace(/\\/g, "/").replace(/^\.\//, "");
        if (candidate.endsWith("/")) return file.startsWith(candidate);
        return file === candidate;
      }));
      if (!permitted) {
        const restored = await restoreFromSnapshot(workspace, before);
        const result = {
          passed: false,
          reason: "out_of_scope_edit",
          attempts,
          workspaceRestored: true,
          restoredFiles: restored,
          manifest: await snapshotWorkspace(workspace),
          changes: { added: [], modified: [], removed: [] },
          verification: { passed: false, output: "The change touched files outside the allowed set.", detail: { changedFiles } },
        };
        if (onAttempt) await onAttempt({ attempt, ...result });
        return result;
      }
    }

    let verification;
    if (proposalError) {
      verification = { passed: false, output: `the builder failed before returning a proposal: ${proposalError}`, detail: { builderError: true } };
    } else {
      try {
        verification = await verify({ attempt, changedFiles });
      } catch (error) {
        verification = { passed: false, output: String(error?.message ?? error).slice(0, MAX_FEEDBACK_CHARS), detail: { error: true } };
      }
    }

    const record = {
      attempt,
      changedFiles,
      notes: typeof proposal?.notes === "string" ? proposal.notes.slice(0, 2_000) : (proposal?.notes ?? null),
      builderStatus: proposal?.status ?? null,
      builderError: proposalError,
      passed: Boolean(verification?.passed),
      output: typeof verification?.output === "string" ? verification.output.slice(0, MAX_FEEDBACK_CHARS) : "",
      detail: verification?.detail ?? null,
    };
    attempts.push(record);
    if (onAttempt) await onAttempt(record);

    if (record.passed) {
      const after = await snapshotWorkspace(workspace);
      return {
        passed: true,
        reason: "verified",
        attempts,
        workspaceRestored: false,
        manifest: after,
        changes: diffManifests(before, after),
        verification: { passed: true, output: record.output, detail: record.detail },
      };
    }

    feedback = {
      attempt,
      failedCheck: record.output || "The authoritative check failed without output.",
      changedFiles,
    };
  }

  const restored = await restoreFromSnapshot(workspace, before);
  const after = await snapshotWorkspace(workspace);
  return {
    passed: false,
    reason: "attempts_exhausted",
    attempts,
    workspaceRestored: true,
    restoredFiles: restored,
    manifest: after,
    changes: diffManifests(before, after),
    verification: {
      passed: false,
      output: attempts.at(-1)?.output ?? "",
      detail: attempts.at(-1)?.detail ?? null,
    },
  };
}

/**
 * Normalizes a builder response into the edit protocol understood by the repair loop.
 *
 * Two protocols are supported:
 *  - `until-builder/v1`: the harness writes the files itself and returns a summary.
 *  - `until-builder/v2`: the harness returns `{ edits: [{ path, content }] }` and the
 *    engine applies them, so the same harness can be re-run with the failed check
 *    as feedback.
 */
export function normalizeBuilderResponse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Builder result must be an object");
  }
  const edits = Array.isArray(value.edits) ? value.edits : null;
  if (!edits) {
    return { protocol: "until-builder/v1", edits: null, applied: true, notes: value.summary ?? value.notes ?? null, raw: value };
  }
  for (const edit of edits) {
    if (!edit || typeof edit !== "object") throw new Error("Each builder edit must be an object");
    if (typeof edit.path !== "string" || !edit.path.trim()) throw new Error("Each builder edit requires a path");
    if (typeof edit.content !== "string") throw new Error("Each builder edit requires string content");
  }
  return {
    protocol: "until-builder/v2",
    edits: edits.map((edit) => ({ path: edit.path, content: edit.content })),
    applied: false,
    notes: value.notes ?? value.summary ?? null,
    raw: value,
  };
}
