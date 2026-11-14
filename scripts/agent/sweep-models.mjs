#!/usr/bin/env node
/**
 * Прогоняет настоящего агента по нескольким локальным моделям подряд и
 * собирает сводку. Каждый прогон — это отдельный реальный запуск
 * `run-agent-proof.mjs`: копия репозитория, засеянный дефект, настоящий
 * падающий тест, настоящее ядро.
 *
 * Использование:
 *   node scripts/agent/sweep-models.mjs --models a,b,c [--attempts 3] [--steps 20]
 *
 * Финальный отчёт: .until/agent-runs/sweep-<stamp>.json и .until/agent-runs/sweep-<stamp>.md
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { actualNodeBinary } from '../node-binary.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : fallback
}
const stamp = flag('stamp', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'))
const attempts = flag('attempts', '3')
const steps = flag('steps', '20')
const structured = args.includes('--structured')
const models = flag('models', '').split(',').map((value) => value.trim()).filter(Boolean)
if (!models.length) {
  console.error('Нужны модели: --models qwen3:14b,gemma3:12b')
  process.exit(2)
}

function run(label, model) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(actualNodeBinary(), [
      path.join(root, 'scripts', 'agent', 'run-agent-proof.mjs'),
      '--label', label,
      '--model', model,
      '--attempts', attempts,
      '--steps', steps,
      ...(structured ? ['--structured'] : []),
    ], { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('close', (code) => resolve({ label, model, code, stdout, stderr, wallMs: Date.now() - started }))
  })
}

const outDir = path.join(root, '.until', 'agent-runs')
await mkdir(outDir, { recursive: true })
const results = []
for (const model of models) {
  const label = `${stamp}-${model.replace(/[^a-zA-Z0-9.-]+/g, '_')}`
  console.log(`\n=== ${label} ===`)
  const outcome = await run(label, model)
  let report = null
  try {
    report = JSON.parse(await readFile(path.join(outDir, label, 'report.json'), 'utf8'))
  } catch { /* прогона не было — разберём stdout */ }
  const row = {
    label,
    model,
    structured,
    exitCode: outcome.code,
    wallMs: outcome.wallMs,
    elapsedMs: report?.elapsedMs ?? null,
    repairPassed: report?.repair?.passed ?? null,
    repairReason: report?.repair?.reason ?? null,
    repairAttempts: report?.repair?.attempts ?? null,
    sourceChanged: report?.sourceChanged ?? null,
    verdictPassed: report?.verdict?.passed ?? null,
    releaseStatus: report?.release?.status ?? null,
    auditValid: report?.audit?.valid ?? null,
    auditEvents: report?.audit?.count ?? null,
    steps: report?.attempts?.length ?? null,
    stdout: outcome.stdout.slice(-2000),
    stderr: outcome.stderr.slice(-2000),
  }
  results.push(row)
  console.log(`${row.repairPassed ? 'REPAIRED' : 'NOT REPAIRED'}  ${model}  ${outcome.wallMs} ms  reason=${row.repairReason}  verdict=${row.verdictPassed}  release=${row.releaseStatus}  audit=${row.auditValid}`)
}

const stampSafe = stamp.replace(/[^a-zA-Z0-9.-]+/g, '-')
const jsonPath = path.join(outDir, `sweep-${stampSafe}.json`)
await writeFile(jsonPath, JSON.stringify({ format: 'until-agent-sweep/v1', stamp, attempts, steps, results }, null, 2), 'utf8')
const rows = results.map((row) => `| ${row.model} | ${row.repairPassed ? 'починил' : 'не починил'} | ${row.repairReason ?? '-'} | ${row.verdictPassed ?? '-'} | ${row.releaseStatus ?? '-'} | ${row.auditValid ? 'valid' : 'broken'} | ${Math.round((row.elapsedMs ?? row.wallMs) / 1000)} с |`)
const md = [
  `# Прогоны ${stamp}`,
  '',
  '| модель | починка | причина | вердикт | релиз | аудит | время |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows,
  '',
].join('\n')
await writeFile(path.join(outDir, `sweep-${stampSafe}.md`), md, 'utf8')
console.log(`\n${md}`)
console.log(`report: ${jsonPath}`)
