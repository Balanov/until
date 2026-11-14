import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { REAL_SIGNAL_KINDS } from "./policy.js";

/**
 * Environment and queue health check.
 *
 * A buyer asking "where is the test and where is the security" deserves one
 * command that answers it with facts about their own installation, not a brochure.
 * `until doctor` reports exactly what is healthy, what is degraded and what is
 * blocked — including dead-lettered work that would otherwise stay invisible.
 */

const check = (id, status, message, detail = null) => ({ id, status, message, detail });

export async function doctor(store, { workspace = process.cwd(), config = {}, online = false } = {}) {
  const checks = [];

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push(nodeMajor >= 24
    ? check("runtime.node", "ok", `Node.js ${process.versions.node} satisfies the >= 24 requirement`)
    : check("runtime.node", "fail", `Node.js ${process.versions.node} is below the required >= 24`, { major: nodeMajor }));

  try {
    const probe = await mkdtemp(path.join(os.tmpdir(), "until-doctor-"));
    await writeFile(path.join(probe, "probe.txt"), "ok", "utf8");
    await rm(probe, { recursive: true, force: true });
    checks.push(check("workspace.writable", "ok", `Workspace is writable: ${path.resolve(workspace)}`));
  } catch (error) {
    checks.push(check("workspace.writable", "fail", `Workspace is not writable: ${error.message}`));
  }

  let integrity = "unknown";
  try {
    const result = store.db.prepare("PRAGMA integrity_check").get();
    integrity = Object.values(result ?? {})[0] ?? "unknown";
  } catch (error) {
    integrity = `error: ${error.message}`;
  }
  checks.push(integrity === "ok"
    ? check("database.integrity", "ok", "SQLite integrity check passed")
    : check("database.integrity", "fail", `SQLite integrity check returned: ${integrity}`));

  const audit = store.verifyEvents();
  checks.push(audit.valid
    ? check("audit.chain", "ok", `Event hash chain is intact across ${audit.count} events`)
    : check("audit.chain", "fail", `Event hash chain is broken: ${audit.reason}`, audit));

  const dead = store.listTasks({ states: ["dead"], limit: 10_000 });
  checks.push(dead.length === 0
    ? check("queue.dead_letter", "ok", "No dead-lettered tasks")
    : check("queue.dead_letter", "warn", `${dead.length} task(s) exhausted their attempt budget and are not retried automatically`, {
      tasks: dead.slice(0, 10).map((task) => ({ id: task.id, kind: task.kind, attempts: task.attempts, error: task.last_error })),
      remedy: "until replay <taskId>",
    }));

  const stale = store.listTasks({ states: ["leased"], limit: 10_000 })
    .filter((task) => task.lease_until && task.lease_until <= Date.now());
  checks.push(stale.length === 0
    ? check("queue.leases", "ok", "No expired leases are held")
    : check("queue.leases", "warn", `${stale.length} expired lease(s) will be recovered on the next cycle`, {
      tasks: stale.slice(0, 10).map((task) => ({ id: task.id, kind: task.kind })),
    }));

  const pending = store.pendingOutbox(1000);
  checks.push(pending.length === 0
    ? check("outbox.pending", "ok", "No pending external actions")
    : check("outbox.pending", "warn", `${pending.length} external action(s) are queued for publication`, {
      items: pending.slice(0, 10).map((item) => ({ id: item.id, action: item.action })),
    }));

  const goalsWithoutMetrics = store.listGoals().filter((goal) => goal.baseline == null || goal.target == null);
  checks.push(goalsWithoutMetrics.length === 0
    ? check("goals.outcome_metrics", "ok", "Every goal declares a baseline and a target")
    : check("goals.outcome_metrics", "warn", `${goalsWithoutMetrics.length} goal(s) have no baseline/target, so the outcome can never close`, {
      goals: goalsWithoutMetrics.map((goal) => ({ id: goal.id, baseline: goal.baseline, target: goal.target })),
    }));

  const liveRoles = Object.entries(config.models ?? {})
    .filter(([, model]) => model?.type !== "replay" && model?.enabled !== false);
  if (!liveRoles.length) {
    checks.push(check("models.configured", "warn", "No live model is configured; runs fall back to deterministic fixtures", {
      remedy: "Copy until.config.example.json to until.config.json and set a role model.",
    }));
  } else {
    const missingAcceptance = store.listGoals()
      .filter((goal) => !Array.isArray(goal.policy?.acceptance) || !goal.policy.acceptance.length)
      .map((goal) => goal.id);
    checks.push(missingAcceptance.length === 0
      ? check("models.acceptance_lock", "ok", "Every goal locks authoritative acceptance checks for live contracts")
      : check("models.acceptance_lock", "warn", `${missingAcceptance.length} goal(s) have no goal.policy.acceptance; live contracts for them stop fail-closed`, {
        goals: missingAcceptance,
        remedy: "Add goal.policy.acceptance — the builder cannot author its own definition of done.",
      }));
  }

  const unconsented = store.db.prepare(
    `SELECT COUNT(*) AS count FROM signals WHERE kind IN (${REAL_SIGNAL_KINDS.map(() => "?").join(",")}) AND consent = 0`,
  ).get(...REAL_SIGNAL_KINDS);
  checks.push((unconsented?.count ?? 0) === 0
    ? check("evidence.consent", "ok", "Every real-kind signal carries consent")
    : check("evidence.consent", "warn", `${unconsented.count} real-kind signal(s) have no consent and therefore cannot unlock delivery`, {
      remedy: "until import --consent asserts operator-verified consent for a file.",
    }));

  const blockedGoals = store.listGoals().filter((goal) => ["blocked_rework", "blocked_risk"].includes(goal.status));
  checks.push(blockedGoals.length === 0
    ? check("goals.blocked", "ok", "No goal is blocked")
    : check("goals.blocked", "warn", `${blockedGoals.length} goal(s) are blocked and will not progress until the owner changes the goal`, {
      goals: blockedGoals.map((goal) => ({ id: goal.id, status: goal.status })),
      remedy: "blocked_rework means the acceptance checks could not be satisfied within goal.policy.maxRevisions.",
    }));

  if (online && liveRoles.length) {
    for (const [role, model] of liveRoles) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${String(model.baseURL).replace(/\/$/, "")}/models`, { signal: controller.signal });
        clearTimeout(timer);
        checks.push(check(`model.${role}`, response.ok ? "ok" : "warn", `Endpoint ${model.baseURL} answered with HTTP ${response.status}`));
      } catch (error) {
        checks.push(check(`model.${role}`, "warn", `Endpoint ${model.baseURL} is unreachable: ${error.message}`));
      }
    }
  }

  const order = { fail: 0, warn: 1, ok: 2 };
  checks.sort((a, b) => order[a.status] - order[b.status]);
  return {
    ok: !checks.some((item) => item.status === "fail"),
    generatedAt: new Date().toISOString(),
    counts: {
      ok: checks.filter((item) => item.status === "ok").length,
      warn: checks.filter((item) => item.status === "warn").length,
      fail: checks.filter((item) => item.status === "fail").length,
    },
    checks,
  };
}
