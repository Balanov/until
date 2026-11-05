import { performance } from "node:perf_hooks";
import { Agents } from "./agents.js";
import { evaluateEvidenceGate, TASK_RULES } from "./policy.js";
import { newId, sleep, stableKey } from "./util.js";

export class Director {
  constructor(store) {
    this.store = store;
  }

  ensureWork() {
    const created = [];
    for (const goal of this.store.listGoals()) {
      if (["achieved", "closed"].includes(goal.status)) continue;
      const tasks = this.store.listTasks({ goalId: goal.id });
      const active = tasks.some((task) => ["queued", "leased"].includes(task.state));
      if (active) continue;
      const opportunities = this.store.opportunitiesForGoal(goal.id);
      const latest = opportunities.at(-1);
      const signals = this.store.signalsForGoal(goal.id);

      if (goal.status === "observing") {
        const release = this.store.latestRelease(goal.id);
        if (!release) continue;
        const observations = tasks.filter((task) => task.kind === "outcome.observe" && task.contract.releaseId === release.id);
        const latestObservation = observations.at(-1);
        const metrics = signals.filter((signal) => signal.kind === "metric" && signal.observed_at > release.created_at);
        const newestMetric = metrics.at(-1);
        if (!latestObservation || (newestMetric && newestMetric.created_at > latestObservation.created_at)) {
          const result = this.store.enqueue({
            goalId: goal.id,
            opportunityId: latest?.id ?? null,
            role: "analyst",
            kind: "outcome.observe",
            contract: { goalId: goal.id, generation: latest?.generation ?? 1, releaseId: release.id },
            idempotencyKey: stableKey({ kind: "outcome.observe", releaseId: release.id, signalId: newestMetric?.id ?? "initial" }),
          });
          if (result.created) created.push(result.task);
        }
        continue;
      }

      const hasNewRealEvidence = latest
        && !evaluateEvidenceGate(signals, latest.evidence_ids).allowed
        && evaluateEvidenceGate(signals, signals.map((signal) => signal.id)).allowed;
      const retryableFailure = latest
        && !["blocked_risk", "waiting_evidence"].includes(latest.status)
        && tasks.some((item) => item.opportunity_id === latest.id && ["dead", "canceled"].includes(item.state));
      const needsResearch = !latest
        || ["revision_required", "outcome_missed"].includes(latest.status)
        || hasNewRealEvidence
        || retryableFailure;
      if (needsResearch) {
        const generation = Math.max(0, ...opportunities.map((item) => item.generation)) + 1;
        const result = this.store.enqueue({
          goalId: goal.id,
          opportunityId: latest?.id ?? null,
          role: "researcher",
          kind: "research.synthesize",
          contract: { goalId: goal.id, generation },
        });
        if (result.created) created.push(result.task);
        continue;
      }
      if (latest?.status === "ready") {
        const result = this.store.enqueue({
          goalId: goal.id,
          opportunityId: latest.id,
          role: "owner",
          kind: "product.contract",
          contract: { goalId: goal.id, generation: latest.generation },
        });
        if (result.created) created.push(result.task);
      }
    }
    return created;
  }
}

export class Kernel {
  constructor({ store, agents = null, workerId = newId("worker"), leaseMs = 30_000 }) {
    this.store = store;
    this.agents = agents ?? new Agents({ store });
    this.director = new Director(store);
    this.workerId = workerId;
    this.leaseMs = leaseMs;
  }

  async flushOutbox() {
    const receipts = [];
    for (const item of this.store.pendingOutbox()) {
      receipts.push(await this.agents.publishOutbox(item));
    }
    return receipts;
  }

  knownCost() {
    return this.store.modelUsage().reduce((sum, row) => sum + (row.known_cost ?? 0), 0);
  }

  modelCalls() {
    return this.store.modelUsage().reduce((sum, row) => sum + row.calls, 0);
  }

  async run({
    maxCycles = 1,
    maxTasks = 1000,
    maxModelCalls = 10_000,
    maxCost = null,
    watch = false,
    intervalMs = 1000,
    signal = null,
  } = {}) {
    if (!Number.isInteger(maxCycles) || maxCycles < 1) throw new Error("maxCycles must be a positive integer");
    if (!Number.isInteger(maxTasks) || maxTasks < 1) throw new Error("maxTasks must be a positive integer");
    const started = performance.now();
    const initialCost = this.knownCost();
    const initialModelCalls = this.modelCalls();
    let cycles = 0;
    let completed = 0;
    let failed = 0;
    let stale = 0;
    let idleRounds = 0;
    let blockedBudget = false;

    while (watch || cycles < maxCycles) {
      if (signal?.aborted || this.store.getEpochState().stopped) break;
      if (completed >= maxTasks || this.modelCalls() - initialModelCalls >= maxModelCalls) {
        blockedBudget = true;
        this.store.recordEvent("kernel.budget_blocked", "kernel", { completed, modelCalls: this.modelCalls() - initialModelCalls });
        break;
      }
      if (maxCost != null && this.knownCost() - initialCost >= maxCost) {
        blockedBudget = true;
        this.store.recordEvent("kernel.budget_blocked", "kernel", { cost: this.knownCost() - initialCost, maxCost });
        break;
      }
      cycles += 1;
      this.store.recoverLeases();
      this.director.ensureWork();
      let worked = false;

      while (completed < maxTasks && this.modelCalls() - initialModelCalls < maxModelCalls) {
        if (signal?.aborted || this.store.getEpochState().stopped) break;
        if (maxCost != null && this.knownCost() - initialCost >= maxCost) break;
        const task = this.store.leaseNext(this.workerId, this.leaseMs);
        if (!task) break;
        if (!TASK_RULES[task.kind]) {
          await Promise.resolve(this.store.failTask(task.id, task.lease_token, `Unknown task kind: ${task.kind}`, { retry: false }));
          failed += 1;
          continue;
        }
        worked = true;
        try {
          const result = await this.agents.execute(task);
          const completion = this.store.completeTask(task.id, task.lease_token, result);
          if (!completion.accepted) stale += 1;
          else completed += 1;
        } catch (error) {
          const failure = this.store.failTask(task.id, task.lease_token, error, { retry: error.retry !== false });
          if (!failure.accepted) stale += 1;
          else failed += 1;
        }
        await this.flushOutbox();
      }

      if (!worked) idleRounds += 1;
      else idleRounds = 0;
      if (!watch) {
        const hasReady = this.store.readyTasks(1).length > 0;
        if (!worked && !hasReady && this.store.pendingOutbox().length === 0) break;
      } else if (!worked) {
        try { await sleep(intervalMs, { signal }); } catch { break; }
      }
    }

    return {
      cycles,
      completed,
      failed,
      stale,
      idleRounds,
      blockedBudget,
      elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
      status: this.store.status(),
    };
  }
}
