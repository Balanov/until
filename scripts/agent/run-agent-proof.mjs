#!/usr/bin/env node
/**
 * Runs a real local-model coding agent against the real product code, through the
 * real UNTIL kernel, and publishes the trace.
 *
 * What this is:
 *   - a copy of the actual repository, with a real failing regression test;
 *   - a real tool-using agent (Ollama) that reads, runs the check and edits;
 *   - the real kernel that owns the task, the allowlist, the attempt budget,
 *     the independent verifier and the release candidate.
 *
 * What this is not: a claim about model quality. The agent is a 14B local model.
 * The point is that the loop, the boundaries and the rollback work with a real
 * model on real code — and that whatever it produces is independently verified.
 *
 * Usage: node scripts/agent/run-agent-proof.mjs [--label run-1] [--model qwen3:14b]
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from '../../src/store.js'
import { Kernel } from '../../src/kernel.js'
import { Agents } from '../../src/agents.js'
import { ModelRouter } from '../../src/model.js'
import { actualNodeBinary } from '../node-binary.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}

const label = flag('label', 'run-1')
const model = flag('model', process.env.UNTIL_AGENT_MODEL ?? 'qwen3:14b')
const maxAttempts = Number(flag('attempts', '3'))
// The owner role writes the contract the builder receives. With structured
// outputs the provider is forced to answer inside the schema, which is what a
// hosted model does by default. Without it the answer is validated afterwards
// and a model that adds a field loses the whole run before the builder starts.
const structured = args.includes('--structured')
const runRoot = path.join(root, '.until', 'agent-runs', label)
const workspace = path.join(runRoot, 'workspace')
const builderPath = path.join(root, 'scripts', 'agent', 'ollama-builder.mjs')
process.env.UNTIL_AGENT_MODEL = model

await rm(runRoot, { recursive: true, force: true })
await mkdir(workspace, { recursive: true })
// The agent gets the real product code, not a toy: the whole repository, minus
// build output and local state.
const COPY_ENTRIES = ['src', 'test', 'benchmarks', 'scripts', 'examples', 'app', 'package.json']
const EXCLUDED = new Set(['node_modules', 'dist', '.git', '.until', 'proof-runs', 'coverage', '.vite'])
for (const entry of COPY_ENTRIES) {
  const from = path.join(root, entry)
  if (!existsSync(from)) continue
  await cp(from, path.join(workspace, entry), {
    recursive: true,
    filter: (source) => !EXCLUDED.has(path.basename(source)),
  })
}

// Seed the defect into the copy so the run always starts from the same red state,
// whether or not the fix has already landed upstream. The run is worthless if the
// check is green before the agent starts, so that is verified below.
const seeded = path.join(workspace, 'src', 'executor', 'workspace.js')
let seededSource = await readFile(seeded, 'utf8')
const seededBefore = seededSource
seededSource = seededSource
  .replace(
    'const bytes = await readFile(absolute);\n    files.push({ path: relative, bytes: info.size, sha256: sha256(bytes) });\n    if (captureContent) contents.set(relative, bytes);',
    'const content = await readFile(absolute, "utf8");\n    files.push({ path: relative, bytes: info.size, sha256: sha256(content) });\n    if (captureContent) contents.set(relative, content);',
  )
  .replace('currentContent = await readFile(absolute);', 'currentContent = await readFile(absolute, "utf8");')
  .replace('if (currentContent && Buffer.compare(currentContent, content) === 0) continue;', 'if (currentContent === content) continue;')
if (seededSource !== seededBefore) await writeFile(seeded, seededSource, 'utf8')

const store = new Store(path.join(runRoot, 'state.db'))
// The owner role is a real model here: it turns the observation into the contract
// the builder receives, so the builder gets a real requirement instead of a stub.
const models = new ModelRouter({
  store,
  roles: {
    owner: {
      type: 'openai-compatible',
      baseURL: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1',
      model,
      timeoutMs: 600_000,
      structuredOutputs: structured,
    },
  },
})
const agents = new Agents({
  store,
  models,
  workspace,
  // A local 14B model needs minutes per step, not seconds. The builder budget has to
  // be realistic or the harness kills a perfectly healthy agent mid-flight.
  builderProfile: { command: actualNodeBinary(), args: [builderPath], timeoutMs: 1_200_000 },
  sandboxConfirmed: true,
  commandProfiles: {
    repoTest: {
      command: actualNodeBinary(),
      args: ['--test', '--test-reporter=spec', 'test/*.test.mjs'],
      timeoutMs: 300_000,
    },
  },
})
const kernel = new Kernel({ store, agents, leaseMs: 1_500_000 })

store.addGoal({
  id: 'goal_binary',
  title: 'The repair loop corrupts binary files when it rolls back',
  outcome: 'A failed repair attempt must leave the repository byte-identical',
  baseline: 0,
  target: 1,
  unit: 'ratio',
  policy: {
    acceptance: [
      { type: 'command_profile', profile: 'repoTest', expect: { exitCode: 0 } },
    ],
    releasePaths: ['src/executor/workspace.js', 'test/executor-binary.test.mjs'],
    // The owner authorises the risk this autonomous flow may take.
    maxRisk: 'high',
    autonomy: 'sandbox',
    maxAttempts: 3,
    build: {
      testProfile: 'repoTest',
      maxAttempts,
      maxSteps: Number(flag('steps', '20')),
      allowedPaths: ['src/executor/workspace.js'],
    },
  },
})
store.addSignal({
  id: 'sig_binary',
  goalId: 'goal_binary',
  kind: 'incident',
  source: 'fixture://observed/repair-rollback',
  content: 'After a repair attempt exhausted its budget, a PNG in the workspace was restored as mangled UTF-8 text and the snapshot hash no longer matched the real file bytes.',
  consent: true,
  observedAt: '2026-11-14T00:00:00.000Z',
})

const before = await readFile(path.join(workspace, 'src', 'executor', 'workspace.js'), 'utf8')

// The acceptance check must be red before the agent starts, or the run proves nothing.
const seededCheck = spawnSync(actualNodeBinary(), ['--test', '--test-reporter=spec', 'test/*.test.mjs'], { cwd: workspace, encoding: 'utf8' })
if (seededCheck.status === 0) {
  console.error('The seeded defect did not make the check fail — the run would prove nothing.')
  process.exit(2)
}
const seededText = `${seededCheck.stdout}${seededCheck.stderr}`
const seededNames = [...seededText.matchAll(/^✖ (.+?) \(\d/mg)].map((match) => match[1])
const seededUnique = [...new Set(seededNames)]
// The seeded defect must produce its own failures. An unrelated failure elsewhere
// — a flaky test on a loaded machine — must not silently cancel the run; it is
// recorded instead, and the acceptance check will reject the release anyway.
const SEEDED_EXPECTED = [/snapshot hashes a binary file by its real bytes/i, /restore returns a binary file byte for byte/i]
const seededMissing = SEEDED_EXPECTED.filter((pattern) => !seededUnique.some((name) => pattern.test(name)))
if (seededMissing.length) {
  console.error(`The workspace must start with the two binary-safety failures. Missing: ${seededMissing.map(String).join(', ')}; got: ${JSON.stringify(seededUnique)}`)
  process.exit(2)
}
const seededExtra = seededUnique.filter((name) => !SEEDED_EXPECTED.some((pattern) => pattern.test(name)))
if (seededExtra.length) console.error(`[harness] unrelated failures in the baseline: ${JSON.stringify(seededExtra)}`)
const seededFailure = seededText.split('\n')
  .filter((line) => /✖|AssertionError|expected:|actual:/.test(line))
  .slice(0, 12)
  .join('\n')

const started = Date.now()
const run = await kernel.run({ maxCycles: 8, maxTasks: 20 })
const elapsed = Date.now() - started

const after = await readFile(path.join(workspace, 'src', 'executor', 'workspace.js'), 'utf8')
const artifact = store.artifactsForGoal('goal_binary').find((item) => item.kind === 'product.experiment')
const parsed = artifact ? JSON.parse(artifact.content) : null
const verdict = artifact ? store.verdictForArtifact(artifact.id) : null
const release = store.latestRelease('goal_binary')

const report = {
  format: 'until-agent-proof/v1',
  mode: 'real_local_model_agent_on_real_code_through_the_real_kernel',
  label,
  model,
  structuredOwner: structured,
  task: store.getGoal('goal_binary').title,
  requirement: store.listTasks().find((task) => task.kind === 'product.contract')?.contract?.spec?.summary ?? null,
  workspace: 'a copy of this repository, including the real failing regression test',
  seededDefect: 'snapshotWorkspace() decoded file contents as UTF-8 text before hashing, so binary files hashed wrong and the rollback wrote mangled text back',
  seededCheckFailed: true,
  seededFailure,
  seededExtraFailures: seededExtra,
  allowedPaths: ['src/executor/workspace.js'],
  acceptanceCheck: 'node --test --test-reporter=spec "test/*.test.mjs"',
  elapsedMs: elapsed,
  run: { cycles: run.cycles, completed: run.completed, failed: run.failed, stale: run.stale },
  attempts: parsed?.repair?.trail ?? null,
  repair: parsed?.repair ? {
    passed: parsed.repair.passed,
    reason: parsed.repair.reason,
    attempts: parsed.repair.attempts,
    changedFiles: parsed.repair.changedFiles,
    workspaceRestored: parsed.repair.workspaceRestored,
  } : null,
  sourceChanged: before !== after,
  sourceBytesBefore: Buffer.byteLength(before),
  sourceBytesAfter: Buffer.byteLength(after),
  artifactStatus: artifact?.status ?? null,
  verdict: verdict ? { passed: verdict.passed, checks: verdict.checks } : null,
  release: release ? { id: release.id, status: release.status, files: release.receipt?.workspace?.files ?? null } : null,
  audit: store.verifyEvents(),
  events: store.db.prepare('SELECT id, type, actor, payload FROM events ORDER BY id').all()
    .map((row) => ({ id: row.id, type: row.type, actor: row.actor, payload: JSON.parse(row.payload) })),
}

const publicPath = path.join(root, 'app', 'public', 'fixtures', 'agent-run.json')
await writeFile(publicPath, JSON.stringify(report, null, 2), 'utf8')
await writeFile(path.join(runRoot, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
await writeFile(path.join(runRoot, 'workspace-after.js'), after, 'utf8')

console.log(JSON.stringify({
  model,
  elapsedMs: elapsed,
  completed: run.completed,
  failed: run.failed,
  repair: report.repair,
  sourceChanged: report.sourceChanged,
  verdictPassed: verdict?.passed ?? null,
  releaseStatus: release?.status ?? null,
  auditValid: report.audit.valid,
  published: publicPath,
}, null, 2))

store.close()
