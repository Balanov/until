#!/usr/bin/env node
/**
 * Проверяет, какие локальные модели вообще способны вести этот протокол.
 *
 * Прежде чем тратить десятки минут на полный прогон, каждой модели задаётся
 * ровно один вопрос — тем же промптом и той же JSON-схемой, что и в реальном
 * агенте. Модель, которая не может вернуть корректный JSON-объект, прогон не
 * пройдёт в любом случае.
 *
 * Использование:
 *   node scripts/agent/smoke-models.mjs [model ...] [--out <file>]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOOL_SCHEMA, systemPrompt, parseJson, normalizeAction } from './ollama-builder.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const outPath = outIndex >= 0 ? args[outIndex + 1] : path.join(root, '.until', 'agent-runs', 'model-smoke.json')
const requested = args.filter((value, index) => !value.startsWith('--') && !(outIndex >= 0 && index === outIndex + 1))

const OLLAMA = process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434'

async function availableModels() {
  const response = await fetch(`${OLLAMA}/api/tags`)
  if (!response.ok) throw new Error(`ollama HTTP ${response.status}`)
  const payload = await response.json()
  return (payload.models ?? []).map((model) => model.name)
}

async function smoke(model) {
  const started = Date.now()
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt(['src/executor/workspace.js']) },
      {
        role: 'user',
        content: [
          'Task: The repair loop corrupts binary files when it rolls back',
          '',
          'Requirement:',
          'A failed repair attempt must leave the repository byte-identical',
          '',
          'The acceptance check you must satisfy:',
          '  node --test --test-reporter=spec test/*.test.mjs',
          '',
          'Start by running the acceptance check to see the current failure.',
          '',
          'Begin. Emit one JSON object.',
        ].join('\n'),
      },
    ],
    stream: false,
    format: TOOL_SCHEMA,
    think: false,
    options: { temperature: 0.15, num_ctx: 32768 },
  })
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 600_000)
    const response = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300).replace(/\s+/g, ' ')
      return { model, ok: false, error: `HTTP ${response.status}: ${detail}`, elapsedMs: Date.now() - started }
    }
    const payload = await response.json()
    const content = payload?.message?.content ?? ''
    let tool = null
    let parsed = false
    try {
      const action = normalizeAction(parseJson(content))
      tool = action.tool ?? null
      parsed = true
    } catch { parsed = false }
    return {
      model,
      ok: parsed && tool === 'run_check',
      tool,
      parsed,
      elapsedMs: Date.now() - started,
      tokens: payload?.eval_count ?? null,
      reply: content.slice(0, 400),
    }
  } catch (error) {
    return { model, ok: false, error: String(error?.message ?? error), elapsedMs: Date.now() - started }
  }
}

const models = requested.length ? requested : await availableModels()
const results = []
for (const model of models) {
  const result = await smoke(model)
  results.push(result)
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${model.padEnd(34)} ${String(result.elapsedMs).padStart(7)} ms  tool=${result.tool ?? '-'}  ${result.error ?? ''}`)
}

await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(outPath, JSON.stringify({ format: 'until-agent-model-smoke/v1', host: OLLAMA, results }, null, 2), 'utf8')
console.log(`\nreport: ${outPath}`)
