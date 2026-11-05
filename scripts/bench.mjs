import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Store } from "../src/store.js";
import { actualNodeBinary } from "./node-binary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "app", "public");
await mkdir(publicRoot, { recursive: true });
const N = 1000;
const ROUNDS = 15;
const enqueueSamples = [];
const drainSamples = [];

for (let round = 0; round < ROUNDS; round += 1) {
  const store = new Store(":memory:");
  store.addGoal({ id: "bench", title: "Intrinsic scheduler benchmark", outcome: "Measure queue mechanics" });
  const enqueueStart = performance.now();
  for (let index = 0; index < N; index += 1) {
    store.enqueue({
      goalId: "bench",
      role: "researcher",
      kind: "research.synthesize",
      contract: { goalId: "bench", generation: index + 1 },
      idempotencyKey: `bench-${round}-${index}`,
    });
  }
  enqueueSamples.push(performance.now() - enqueueStart);
  const drainStart = performance.now();
  let completed = 0;
  while (true) {
    const task = store.leaseNext("bench-worker");
    if (!task) break;
    const result = store.completeTask(task.id, task.lease_token, { benchmark: true });
    if (!result.accepted) throw new Error("Benchmark completion rejected");
    completed += 1;
  }
  drainSamples.push(performance.now() - drainStart);
  if (completed !== N) throw new Error(`Expected ${N} completed tasks, got ${completed}`);
  if (!store.verifyEvents().valid) throw new Error("Benchmark audit chain failed");
  store.close();
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((total, value) => total + value, 0);
  return {
    count: samples.length,
    medianMs: sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    meanMs: sum / samples.length,
    minMs: sorted[0],
    maxMs: sorted.at(-1),
  };
}

async function startupSample() {
  const started = performance.now();
  await new Promise((resolve, reject) => {
    const child = spawn(actualNodeBinary(), [path.join(root, "bin", "until.mjs"), "--version"], { shell: false });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 || output.trim() !== "0.2.0") return reject(new Error(`Invalid CLI startup result: ${code} ${output}`));
      resolve();
    });
  });
  return performance.now() - started;
}

const startupSamples = [];
for (let index = 0; index < 30; index += 1) startupSamples.push(await startupSample());

async function sourceBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await sourceBytes(file);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) total += (await stat(file)).size;
  }
  return total;
}

const result = {
  format: "until-benchmark/v1",
  version: "0.2.0",
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  scenario: {
    tasksPerRound: N,
    rounds: ROUNDS,
    description: "In-memory SQLite enqueue and lease/complete with append-only hash-chain events. No LLM, no agent quality, no competitor comparison.",
  },
  enqueue: { ...stats(enqueueSamples), samplesMs: enqueueSamples },
  drain: { ...stats(drainSamples), samplesMs: drainSamples },
  startup: { ...stats(startupSamples), samplesMs: startupSamples, launches: startupSamples.length },
  coreSourceBytes: await sourceBytes(path.join(root, "src")),
  limitations: "Local observations on one machine. Startup includes process initialization. Queue measurements are not end-to-end agent throughput or business outcomes.",
};
await writeFile(path.join(publicRoot, "benchmarks.json"), JSON.stringify(result, null, 2));
const markdown = `# UNTIL intrinsic benchmarks\n\nGenerated: ${result.generatedAt}\n\nEnvironment: ${result.environment.node} / ${result.environment.platform} / ${result.environment.arch}\n\n| Measurement | Median | p95 | Samples |\n|---|---:|---:|---:|\n| Enqueue ${N} durable tasks | ${result.enqueue.medianMs.toFixed(3)} ms | ${result.enqueue.p95Ms.toFixed(3)} ms | ${ROUNDS} |\n| Lease + complete ${N} tasks | ${result.drain.medianMs.toFixed(3)} ms | ${result.drain.p95Ms.toFixed(3)} ms | ${ROUNDS} |\n| CLI \`--version\` launch | ${result.startup.medianMs.toFixed(3)} ms | ${result.startup.p95Ms.toFixed(3)} ms | 30 |\n\n${result.limitations}\n\nRaw samples are in \`app/public/benchmarks.json\`. Reproduce with \`npm run bench\`.\n`;
await writeFile(path.join(root, "BENCHMARKS.md"), markdown);
console.log(JSON.stringify(result, null, 2));
