import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const nodeBinary = process.platform === "win32"
  && /Kimi\.exe$/i.test(process.execPath)
  && existsSync("C:\\Program Files\\nodejs\\node.exe")
  ? "C:\\Program Files\\nodejs\\node.exe"
  : process.execPath;
import { Store } from "../src/store.js";
import { Kernel } from "../src/kernel.js";
import { Agents } from "../src/agents.js";
import { ModelRouter } from "../src/model.js";

export async function runtime(t, options = {}) {
  const base = path.join(process.cwd(), ".until");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(path.join(base, "test-"));
  const store = new Store(":memory:");
  const models = options.models === null ? null : new ModelRouter({ store, roles: options.models ?? {} });
  const agents = new Agents({
    store,
    models,
    workspace,
    commandProfiles: options.checks ?? {},
    builderProfile: options.builder ?? null,
    sandboxConfirmed: options.sandboxConfirmed ?? false,
  });
  const kernel = new Kernel({ store, agents, leaseMs: options.leaseMs ?? 1000 });
  t.after(async () => {
    store.close();
    await rm(workspace, { recursive: true, force: true });
  });
  return { store, agents, kernel, workspace, models };
}

export function goal(store, overrides = {}) {
  return store.addGoal({
    id: "goal_test",
    title: "Test product goal",
    outcome: "Improve a measured outcome",
    baseline: 0.2,
    target: 0.4,
    unit: "ratio",
    ...overrides,
  });
}

export function signal(store, overrides = {}) {
  return store.addSignal({
    goalId: "goal_test",
    kind: "interview",
    source: "test://real-participant/1",
    content: "A real consenting participant described an observed repeated failure.",
    consent: true,
    ...overrides,
  });
}

export async function file(workspace, relative, content) {
  const target = path.join(workspace, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return target;
}
