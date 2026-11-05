import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { assertText, canonicalJson, newId, nowIso, safeNumber, sha256, stableKey } from "./util.js";
import { assertOutboxAction, SIGNAL_KINDS } from "./policy.js";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  outcome TEXT NOT NULL,
  baseline REAL,
  target REAL,
  unit TEXT,
  status TEXT NOT NULL,
  policy TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  value REAL,
  unit TEXT,
  observed_at TEXT NOT NULL,
  consent INTEGER NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  statement TEXT NOT NULL,
  mechanism TEXT NOT NULL,
  evidence_ids TEXT NOT NULL,
  status TEXT NOT NULL,
  score REAL NOT NULL,
  generation INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  opportunity_id TEXT REFERENCES opportunities(id),
  role TEXT NOT NULL,
  kind TEXT NOT NULL,
  contract TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  worker_id TEXT,
  epoch INTEGER NOT NULL,
  depends_on TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  last_error TEXT,
  available_at INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_ready ON tasks(state, available_at, created_at);
CREATE INDEX IF NOT EXISTS tasks_goal ON tasks(goal_id, state);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  kind TEXT NOT NULL,
  path TEXT,
  content TEXT,
  hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS verdicts (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  passed INTEGER NOT NULL,
  checks TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  goal_id TEXT NOT NULL REFERENCES goals(id),
  status TEXT NOT NULL,
  receipt TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  digest TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  receipt TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  UNIQUE(action, digest)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_calls (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  role TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost REAL,
  latency_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES strategies(id),
  genome TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategies(id),
  dataset TEXT NOT NULL,
  score REAL NOT NULL,
  safety_failures INTEGER NOT NULL,
  raw TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const json = (value) => JSON.stringify(value);
const fromJson = (value, fallback = null) => value == null ? fallback : JSON.parse(value);
const goal = (row) => row && ({ ...row, policy: fromJson(row.policy, {}) });
const opportunity = (row) => row && ({ ...row, evidence_ids: fromJson(row.evidence_ids, []) });
const task = (row) => row && ({ ...row, contract: fromJson(row.contract, {}), depends_on: fromJson(row.depends_on, []) });
const artifact = (row) => row;
const outbox = (row) => row && ({ ...row, payload: fromJson(row.payload, {}), receipt: fromJson(row.receipt) });
const release = (row) => row && ({ ...row, receipt: fromJson(row.receipt) });

export class Store {
  constructor(file = ":memory:", { now = nowIso, sync = false } = {}) {
    this.file = file;
    this.now = now;
    this.txDepth = 0;
    if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(SCHEMA);
    if (sync) this.db.exec("PRAGMA synchronous = FULL;");
    this.db.prepare("INSERT OR IGNORE INTO meta(key, value) VALUES ('epoch', '0'), ('stopped', '0')").run();
  }

  close() {
    this.db.close();
  }

  transaction(fn) {
    if (this.txDepth > 0) {
      this.txDepth += 1;
      try {
        return fn();
      } finally {
        this.txDepth -= 1;
      }
    }
    this.db.exec("BEGIN IMMEDIATE");
    this.txDepth = 1;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally {
      this.txDepth = 0;
    }
  }

  recordEvent(type, actor, payload = {}) {
    return this.transaction(() => {
      const previous = this.db.prepare("SELECT hash FROM events ORDER BY id DESC LIMIT 1").get();
      const prevHash = previous?.hash ?? "0".repeat(64);
      const ts = this.now();
      const body = { ts, type, actor, payload, prevHash };
      const hash = sha256(canonicalJson(body));
      const result = this.db.prepare(
        "INSERT INTO events(ts, type, actor, payload, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(ts, type, actor, canonicalJson(payload), prevHash, hash);
      return { id: Number(result.lastInsertRowid), ...body, hash };
    });
  }

  verifyEvents() {
    const rows = this.db.prepare("SELECT * FROM events ORDER BY id").all();
    let previous = "0".repeat(64);
    for (const row of rows) {
      if (row.prev_hash !== previous) return { valid: false, reason: "prev_hash_mismatch", eventId: row.id };
      const expected = sha256(canonicalJson({
        ts: row.ts,
        type: row.type,
        actor: row.actor,
        payload: fromJson(row.payload, {}),
        prevHash: row.prev_hash,
      }));
      if (expected !== row.hash) return { valid: false, reason: "event_hash_mismatch", eventId: row.id };
      previous = row.hash;
    }
    return { valid: true, count: rows.length, head: previous };
  }

  getMeta(key) {
    return this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
  }

  setMeta(key, value) {
    this.db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, String(value));
  }

  getEpochState() {
    return { epoch: Number(this.getMeta("epoch")), stopped: this.getMeta("stopped") === "1" };
  }

  stop(reason = "manual stop") {
    return this.transaction(() => {
      const current = this.getEpochState();
      const epoch = current.epoch + 1;
      this.setMeta("epoch", epoch);
      this.setMeta("stopped", 1);
      const changed = this.db.prepare(
        "UPDATE tasks SET state = 'canceled', lease_token = NULL, lease_until = NULL, updated_at = ? WHERE state IN ('queued', 'retry_wait')",
      ).run(this.now()).changes;
      this.recordEvent("kernel.stopped", "operator", { epoch, reason, queuedCanceled: Number(changed) });
      return { epoch, stopped: true, queuedCanceled: Number(changed) };
    });
  }

  reset() {
    return this.transaction(() => {
      this.setMeta("stopped", 0);
      const state = this.getEpochState();
      this.recordEvent("kernel.reset", "operator", state);
      return state;
    });
  }

  addGoal(input) {
    if (!input?.id || !input.title || !input.outcome) throw new Error("Goal requires id, title and outcome");
    assertText(input.id, "goal.id", { max: 200 });
    assertText(input.title, "goal.title", { max: 500 });
    assertText(input.outcome, "goal.outcome", { max: 4000 });
    const baseline = input.baseline == null ? null : safeNumber(input.baseline, "goal.baseline");
    const target = input.target == null ? null : safeNumber(input.target, "goal.target");
    const unit = input.unit == null ? null : assertText(input.unit, "goal.unit", { max: 100 });
    const ts = this.now();
    const status = input.status ?? "open";
    assertText(status, "goal.status", { max: 50 });
    const policy = json(input.policy ?? { autonomy: "sandbox", maxAttempts: 3 });
    if (policy.length > 100_000) throw new Error("Goal policy is too large");
    this.db.prepare(
      "INSERT INTO goals(id, title, outcome, baseline, target, unit, status, policy, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(input.id, input.title, input.outcome, baseline, target, unit, status, policy, ts, ts);
    this.recordEvent("goal.created", "operator", { goalId: input.id, title: input.title });
    return this.getGoal(input.id);
  }

  getGoal(id) {
    return goal(this.db.prepare("SELECT * FROM goals WHERE id = ?").get(id));
  }

  listGoals() {
    return this.db.prepare("SELECT * FROM goals ORDER BY created_at").all().map(goal);
  }

  updateGoal(id, fields) {
    const allowed = ["status", "baseline", "target", "unit", "policy"];
    const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
    if (!entries.length) return this.getGoal(id);
    const values = entries.map(([key, value]) => key === "policy" ? json(value) : value);
    const result = this.db.prepare(
      `UPDATE goals SET ${entries.map(([key]) => `${key} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    ).run(...values, this.now(), id);
    if (!result.changes) throw new Error(`Goal not found: ${id}`);
    this.recordEvent("goal.updated", "kernel", { goalId: id, fields: Object.fromEntries(entries) });
    return this.getGoal(id);
  }

  addSignal(input) {
    if (!input?.goalId || !SIGNAL_KINDS.includes(input.kind)) throw new Error("Invalid signal or signal kind");
    if (!this.getGoal(input.goalId)) throw new Error(`Goal not found: ${input.goalId}`);
    assertText(input.goalId, "signal.goalId", { max: 200 });
    const source = assertText(input.source, "signal.source", { max: 4096 });
    const content = assertText(input.content, "signal.content", { max: 1_000_000 });
    const id = input.id == null ? newId("sig") : assertText(input.id, "signal.id", { max: 200 });
    const value = input.value == null ? null : safeNumber(input.value, "signal.value");
    const unit = input.unit == null ? null : assertText(input.unit, "signal.unit", { max: 100 });
    const ts = this.now();
    const observedAt = input.observedAt ?? ts;
    if (Number.isNaN(Date.parse(observedAt))) throw new Error("Invalid observedAt");
    const consent = input.consent === true || input.consent === 1 ? 1 : 0;
    const hash = sha256(canonicalJson({
      goalId: input.goalId, kind: input.kind, source, content,
      value, unit, observedAt, consent,
    }));
    this.db.prepare(
      "INSERT INTO signals(id, goal_id, kind, source, content, value, unit, observed_at, consent, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.goalId, input.kind, source, content, value, unit, observedAt, consent, hash, ts);
    this.recordEvent("signal.added", "connector", { signalId: id, goalId: input.goalId, kind: input.kind, hash });
    return this.getSignal(id);
  }

  getSignal(id) {
    return this.db.prepare("SELECT * FROM signals WHERE id = ?").get(id);
  }

  signalsForGoal(goalId, { after = null } = {}) {
    if (after) return this.db.prepare("SELECT * FROM signals WHERE goal_id = ? AND observed_at > ? ORDER BY observed_at, id").all(goalId, after);
    return this.db.prepare("SELECT * FROM signals WHERE goal_id = ? ORDER BY observed_at, id").all(goalId);
  }

  addOpportunity(input) {
    const id = input.id ?? newId("opp");
    const ts = this.now();
    this.db.prepare(
      "INSERT INTO opportunities(id, goal_id, statement, mechanism, evidence_ids, status, score, generation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.goalId, input.statement, input.mechanism, json(input.evidenceIds ?? []),
      input.status ?? "hypothesis", input.score ?? 0, input.generation ?? 1, ts, ts);
    this.recordEvent("opportunity.created", "researcher", { opportunityId: id, goalId: input.goalId, generation: input.generation ?? 1 });
    return this.getOpportunity(id);
  }

  getOpportunity(id) {
    return opportunity(this.db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id));
  }

  opportunitiesForGoal(goalId) {
    return this.db.prepare("SELECT * FROM opportunities WHERE goal_id = ? ORDER BY generation, created_at").all(goalId).map(opportunity);
  }

  updateOpportunity(id, status, score = null) {
    const result = this.db.prepare("UPDATE opportunities SET status = ?, score = COALESCE(?, score), updated_at = ? WHERE id = ?")
      .run(status, score, this.now(), id);
    if (!result.changes) throw new Error(`Opportunity not found: ${id}`);
    this.recordEvent("opportunity.updated", "kernel", { opportunityId: id, status });
    return this.getOpportunity(id);
  }

  enqueue(input) {
    return this.transaction(() => {
      const epoch = this.getEpochState().epoch;
      const dependsOn = input.dependsOn ?? [];
      const key = input.idempotencyKey ?? stableKey({
        goalId: input.goalId, kind: input.kind, generation: input.contract?.generation ?? 0,
        opportunityId: input.opportunityId ?? null, epoch,
      });
      const existing = this.db.prepare("SELECT * FROM tasks WHERE idempotency_key = ?").get(key);
      if (existing) return { task: task(existing), created: false };
      if (this.getEpochState().stopped) throw new Error("Kernel is stopped");
      const id = input.id ?? newId("task");
      const ts = this.now();
      const maxAttempts = input.maxAttempts ?? 3;
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new Error("maxAttempts must be 1–20");
      this.db.prepare(
        `INSERT INTO tasks(id, goal_id, opportunity_id, role, kind, contract, state, attempts, max_attempts,
          epoch, depends_on, idempotency_key, available_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, input.goalId, input.opportunityId ?? null, input.role, input.kind,
        canonicalJson(input.contract), maxAttempts, epoch, json(dependsOn), key,
        input.availableAt ?? Date.now(), ts, ts);
      this.recordEvent("task.queued", "director", { taskId: id, kind: input.kind, goalId: input.goalId, epoch });
      return { task: this.getTask(id), created: true };
    });
  }

  getTask(id) {
    return task(this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
  }

  listTasks({ goalId = null, states = null, limit = 1000 } = {}) {
    const clauses = [];
    const values = [];
    if (goalId) { clauses.push("goal_id = ?"); values.push(goalId); }
    if (states?.length) { clauses.push(`state IN (${states.map(() => "?").join(",")})`); values.push(...states); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM tasks ${where} ORDER BY created_at LIMIT ?`).all(...values, limit).map(task);
  }

  readyTasks(limit = 100) {
    const rows = this.db.prepare(
      "SELECT * FROM tasks WHERE state = 'queued' AND available_at <= ? ORDER BY created_at LIMIT ?",
    ).all(Date.now(), Math.max(1, limit * 4)).map(task);
    const ready = [];
    for (const row of rows) {
      if (!row.depends_on.length || row.depends_on.every((id) => this.getTask(id)?.state === "done")) {
        ready.push(row);
        if (ready.length >= limit) break;
      }
    }
    return ready;
  }

  leaseNext(workerId, leaseMs = 30_000) {
    if (!Number.isFinite(leaseMs) || leaseMs < 100 || leaseMs > 3_600_000) throw new Error("Invalid lease duration");
    return this.transaction(() => {
      if (this.getEpochState().stopped) return null;
      const candidate = this.readyTasks(1)[0];
      if (!candidate) return null;
      const token = newId("lease");
      const result = this.db.prepare(
        "UPDATE tasks SET state = 'leased', attempts = attempts + 1, lease_token = ?, lease_until = ?, worker_id = ?, updated_at = ? WHERE id = ? AND state = 'queued'",
      ).run(token, Date.now() + leaseMs, workerId, this.now(), candidate.id);
      if (!result.changes) return null;
      this.recordEvent("task.leased", workerId, { taskId: candidate.id, kind: candidate.kind, attempt: candidate.attempts + 1 });
      return this.getTask(candidate.id);
    });
  }

  completeTask(id, leaseToken, result = {}) {
    return this.transaction(() => {
      const current = this.getTask(id);
      if (!current || current.state !== "leased" || current.lease_token !== leaseToken) {
        return { accepted: false, reason: "invalid_lease" };
      }
      const epoch = this.getEpochState();
      if (epoch.stopped || current.epoch !== epoch.epoch) {
        this.db.prepare("UPDATE tasks SET state = 'canceled', lease_token = NULL, lease_until = NULL, updated_at = ? WHERE id = ?")
          .run(this.now(), id);
        this.recordEvent("task.late_rejected", "kernel", { taskId: id, taskEpoch: current.epoch, currentEpoch: epoch.epoch });
        return { accepted: false, reason: "epoch_changed" };
      }
      this.db.prepare("UPDATE tasks SET state = 'done', lease_token = NULL, lease_until = NULL, last_error = NULL, updated_at = ? WHERE id = ?")
        .run(this.now(), id);
      this.recordEvent("task.done", current.role, { taskId: id, kind: current.kind, result });
      return { accepted: true, task: this.getTask(id) };
    });
  }

  failTask(id, leaseToken, error, { retry = true, backoffMs = 100 } = {}) {
    return this.transaction(() => {
      const current = this.getTask(id);
      if (!current || current.state !== "leased" || current.lease_token !== leaseToken) {
        return { accepted: false, reason: "invalid_lease" };
      }
      const epoch = this.getEpochState();
      const message = String(error?.message ?? error).slice(0, 4000);
      if (epoch.stopped || current.epoch !== epoch.epoch) {
        this.db.prepare("UPDATE tasks SET state = 'canceled', lease_token = NULL, lease_until = NULL, last_error = ?, updated_at = ? WHERE id = ?")
          .run(message, this.now(), id);
        this.recordEvent("task.late_rejected", "kernel", { taskId: id, reason: "epoch_changed" });
        return { accepted: false, reason: "epoch_changed" };
      }
      const canRetry = retry && current.attempts < current.max_attempts;
      const state = canRetry ? "queued" : "dead";
      const availableAt = canRetry ? Date.now() + Math.max(0, backoffMs) : current.available_at;
      this.db.prepare(
        "UPDATE tasks SET state = ?, available_at = ?, lease_token = NULL, lease_until = NULL, last_error = ?, updated_at = ? WHERE id = ?",
      ).run(state, availableAt, message, this.now(), id);
      this.recordEvent(canRetry ? "task.retry" : "task.dead", current.role, { taskId: id, error: message, attempt: current.attempts });
      return { accepted: true, retried: canRetry, task: this.getTask(id) };
    });
  }

  recoverLeases() {
    return this.transaction(() => {
      const expired = this.db.prepare("SELECT * FROM tasks WHERE state = 'leased' AND lease_until <= ?").all(Date.now()).map(task);
      const { epoch, stopped } = this.getEpochState();
      let recovered = 0;
      let canceled = 0;
      let dead = 0;
      for (const item of expired) {
        let state = "queued";
        if (stopped || item.epoch !== epoch) { state = "canceled"; canceled += 1; }
        else if (item.attempts >= item.max_attempts) { state = "dead"; dead += 1; }
        else recovered += 1;
        this.db.prepare("UPDATE tasks SET state = ?, lease_token = NULL, lease_until = NULL, updated_at = ? WHERE id = ?")
          .run(state, this.now(), item.id);
        this.recordEvent("task.lease_expired", "kernel", { taskId: item.id, state });
      }
      return { expired: expired.length, recovered, canceled, dead };
    });
  }

  addArtifact(input) {
    const id = input.id ?? newId("art");
    const content = input.content ?? null;
    if (content != null && typeof content !== "string") throw new Error("Artifact content must be text");
    if (content?.length > 10_000_000) throw new Error("Artifact exceeds 10 MB");
    const hash = input.hash ?? sha256(content ?? "");
    this.db.prepare(
      "INSERT INTO artifacts(id, goal_id, task_id, kind, path, content, hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.goalId, input.taskId, input.kind, input.path ?? null, content, hash,
      input.status ?? "working", this.now());
    this.recordEvent("artifact.created", input.actor ?? "builder", { artifactId: id, taskId: input.taskId, kind: input.kind, hash });
    return this.getArtifact(id);
  }

  getArtifact(id) {
    return artifact(this.db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id));
  }

  artifactsForGoal(goalId) {
    return this.db.prepare("SELECT * FROM artifacts WHERE goal_id = ? ORDER BY created_at").all(goalId).map(artifact);
  }

  artifactsForTask(taskId) {
    return this.db.prepare("SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at").all(taskId).map(artifact);
  }

  updateArtifactStatus(id, status) {
    const result = this.db.prepare("UPDATE artifacts SET status = ? WHERE id = ?").run(status, id);
    if (!result.changes) throw new Error(`Artifact not found: ${id}`);
    this.recordEvent("artifact.status", "verifier", { artifactId: id, status });
    return this.getArtifact(id);
  }

  addVerdict(input) {
    const id = newId("verdict");
    this.db.prepare(
      "INSERT INTO verdicts(id, artifact_id, task_id, passed, checks, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, input.artifactId, input.taskId, input.passed ? 1 : 0, canonicalJson(input.checks), this.now());
    this.recordEvent("verdict.created", "verifier", { verdictId: id, artifactId: input.artifactId, passed: Boolean(input.passed) });
    return { ...input, id, passed: Boolean(input.passed) };
  }

  verdictForArtifact(artifactId) {
    const row = this.db.prepare("SELECT * FROM verdicts WHERE artifact_id = ? ORDER BY created_at DESC LIMIT 1").get(artifactId);
    return row && ({ ...row, checks: fromJson(row.checks, []) });
  }

  createRelease(input) {
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM releases WHERE idempotency_key = ?").get(input.idempotencyKey);
      if (existing) return { release: release(existing), created: false };
      const item = this.getArtifact(input.artifactId);
      if (!item || item.status !== "verified") throw new Error("Only verified artifacts can become release candidates");
      const id = input.id ?? newId("rel");
      this.db.prepare(
        "INSERT INTO releases(id, artifact_id, goal_id, status, idempotency_key, created_at) VALUES (?, ?, ?, 'candidate', ?, ?)",
      ).run(id, input.artifactId, input.goalId, input.idempotencyKey, this.now());
      this.recordEvent("release.candidate", "release", { releaseId: id, artifactId: input.artifactId });
      return { release: this.getRelease(id), created: true };
    });
  }

  getRelease(id) {
    return release(this.db.prepare("SELECT * FROM releases WHERE id = ?").get(id));
  }

  latestRelease(goalId) {
    return release(this.db.prepare("SELECT * FROM releases WHERE goal_id = ? ORDER BY created_at DESC LIMIT 1").get(goalId));
  }

  updateRelease(id, status, receipt = null) {
    const result = this.db.prepare("UPDATE releases SET status = ?, receipt = ? WHERE id = ?")
      .run(status, receipt == null ? null : canonicalJson(receipt), id);
    if (!result.changes) throw new Error(`Release not found: ${id}`);
    this.recordEvent("release.updated", "release", { releaseId: id, status });
    return this.getRelease(id);
  }

  addOutbox(input) {
    assertOutboxAction(input.action);
    return this.transaction(() => {
      const digest = input.digest ?? sha256(canonicalJson({ action: input.action, payload: input.payload }));
      const existing = this.db.prepare("SELECT * FROM outbox WHERE action = ? AND digest = ?").get(input.action, digest);
      if (existing) return { outbox: outbox(existing), created: false };
      const id = input.id ?? newId("out");
      this.db.prepare(
        "INSERT INTO outbox(id, action, digest, payload, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
      ).run(id, input.action, digest, canonicalJson(input.payload), this.now());
      this.recordEvent("outbox.pending", "release", { outboxId: id, action: input.action, digest });
      return { outbox: this.getOutbox(id), created: true };
    });
  }

  getOutbox(id) {
    return outbox(this.db.prepare("SELECT * FROM outbox WHERE id = ?").get(id));
  }

  pendingOutbox(limit = 100) {
    return this.db.prepare("SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at LIMIT ?").all(limit).map(outbox);
  }

  completeOutbox(id, receipt) {
    const current = this.getOutbox(id);
    if (!current) throw new Error(`Outbox item not found: ${id}`);
    if (current.status === "sent") return current;
    this.db.prepare("UPDATE outbox SET status = 'sent', receipt = ?, sent_at = ? WHERE id = ?")
      .run(canonicalJson(receipt), this.now(), id);
    this.recordEvent("outbox.sent", "release", { outboxId: id });
    return this.getOutbox(id);
  }

  addModelCall(input) {
    const id = newId("model");
    this.db.prepare(
      "INSERT INTO model_calls(id, task_id, role, model, prompt_hash, input_tokens, output_tokens, cost, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.taskId ?? null, input.role, input.model, input.promptHash,
      input.inputTokens ?? null, input.outputTokens ?? null, input.cost ?? null, input.latencyMs, this.now());
    return id;
  }

  modelUsage() {
    return this.db.prepare(
      "SELECT model, role, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cost) AS known_cost, SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) AS unknown_cost_calls, AVG(latency_ms) AS mean_latency_ms FROM model_calls GROUP BY model, role ORDER BY model, role",
    ).all();
  }

  addStrategy(input) {
    const id = input.id ?? newId("strategy");
    this.db.prepare("INSERT INTO strategies(id, parent_id, genome, status, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, input.parentId ?? null, canonicalJson(input.genome), input.status ?? "candidate", this.now());
    this.recordEvent("strategy.created", "evolver", { strategyId: id, parentId: input.parentId ?? null, status: input.status ?? "candidate" });
    return this.getStrategy(id);
  }

  getStrategy(id) {
    const row = this.db.prepare("SELECT * FROM strategies WHERE id = ?").get(id);
    return row && ({ ...row, genome: fromJson(row.genome, {}) });
  }

  updateStrategy(id, status) {
    const result = this.db.prepare("UPDATE strategies SET status = ? WHERE id = ?").run(status, id);
    if (!result.changes) throw new Error(`Strategy not found: ${id}`);
    this.recordEvent("strategy.status", "evolver", { strategyId: id, status });
    return this.getStrategy(id);
  }

  addEvaluation(input) {
    const id = newId("eval");
    this.db.prepare(
      "INSERT INTO evaluations(id, strategy_id, dataset, score, safety_failures, raw, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.strategyId, input.dataset, input.score, input.safetyFailures, canonicalJson(input.raw), this.now());
    this.recordEvent("evaluation.created", "evolver", { evaluationId: id, strategyId: input.strategyId, dataset: input.dataset, score: input.score });
    return { ...input, id };
  }

  status(goalId = null) {
    const where = goalId ? "WHERE goal_id = ?" : "";
    const args = goalId ? [goalId] : [];
    const tasks = this.db.prepare(`SELECT state, COUNT(*) AS count FROM tasks ${where} GROUP BY state`).all(...args);
    const signals = goalId
      ? this.db.prepare("SELECT kind, COUNT(*) AS count FROM signals WHERE goal_id = ? GROUP BY kind").all(goalId)
      : this.db.prepare("SELECT kind, COUNT(*) AS count FROM signals GROUP BY kind").all();
    return {
      epoch: this.getEpochState(),
      goals: this.listGoals().map(({ id, status }) => ({ id, status })),
      tasks: Object.fromEntries(tasks.map((row) => [row.state, row.count])),
      signals: Object.fromEntries(signals.map((row) => [row.kind, row.count])),
      models: this.modelUsage(),
      audit: this.verifyEvents(),
    };
  }
}
