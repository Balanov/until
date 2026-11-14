#!/usr/bin/env node
/**
 * A real coding agent for UNTIL, speaking the `until-builder/v2` protocol.
 *
 * It is a tool-using agent over a local Ollama model: it reads files, runs the
 * operator-registered acceptance check, edits the workspace and retries until the
 * check passes or the step budget is exhausted. The UNTIL kernel owns the task,
 * the rights, the budget and the final verdict — this process only proposes work.
 *
 * Protocol
 *   stdin   : one JSON object  { goal, spec, verification, attempt, feedback, ... }
 *   stdout  : one JSON object  { status, notes, edits: [{ path, content }] }
 *
 * The agent never chooses a command, an environment or a path outside the
 * operator-registered allowlist. It only reads and writes inside the workspace.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { listWorkspaceFiles } from '../../src/executor/workspace.js'
import { summarizeFailures } from '../../src/checks.js'

const MODEL = process.env.UNTIL_AGENT_MODEL ?? 'qwen3:14b'
const OLLAMA = process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434'
const DEFAULT_STEPS = 12
const MAX_OUTPUT = 12_000
const MAX_FILE = 80_000

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = ''
    process.stdin.on('data', (chunk) => { input += chunk })
    process.stdin.on('end', () => resolve(input))
    process.stdin.on('error', reject)
  })
}

export function parseJson(text) {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('the model did not return a JSON object')
  return JSON.parse(cleaned.slice(start, end + 1))
}

/**
 * Local models are not consistent about the envelope they use. Accept the common
 * shapes rather than failing the run on a formatting detail.
 */
export function normalizeAction(value) {
  const tool = value.tool ?? value.name ?? value.action ?? value.function?.name ?? null
  const nested = value.arguments ?? value.params ?? value.input ?? value.args ?? {}
  // Arguments may sit at the top level or inside a wrapper object. Keep both.
  const args = typeof nested === 'string' ? parseJson(nested) : { ...value, ...nested }
  const result = { ...args }
  for (const key of ['tool', 'name', 'action', 'function', 'arguments', 'params', 'input', 'args']) delete result[key]
  // Local models rename arguments often enough that aliasing is cheaper than a retry.
  if (result.path === undefined) {
    result.path = result.file ?? result.filePath ?? result.file_path ?? result.filename ?? result.target ?? result.source
  }
  if (result.content === undefined) {
    result.content = result.text ?? result.body ?? result.newContent ?? result.code
  }
  if (result.summary === undefined) {
    result.summary = result.notes ?? result.message ?? result.reason
  }
  if (result.old === undefined) {
    result.old = result.oldText ?? result.old_text ?? result.oldString ?? result.find ?? result.from ?? result.search
  }
  if (result.new === undefined) {
    result.new = result.newText ?? result.new_text ?? result.newString ?? result.replace ?? result.to ?? result.replacement
  }
  return { tool, ...result }
}

export const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    tool: { type: 'string', enum: ['list_files', 'grep', 'read_file', 'patch_file', 'write_file', 'run_check', 'finish'] },
    path: { type: 'string' },
    pattern: { type: 'string' },
    old: { type: 'string' },
    new: { type: 'string' },
    content: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['tool'],
}

async function chat(messages, { temperature = 0.15 } = {}) {
  const body = JSON.stringify({
    model: MODEL,
    messages,
    stream: false,
    format: TOOL_SCHEMA,
    think: false,
    // A 27B model on CPU needs a smaller window than a 9B model on the GPU, and
    // the prefill cost grows with it. The budget is a knob, not a constant.
    options: { temperature, num_ctx: Number(process.env.UNTIL_AGENT_CTX ?? 32768) },
  })
  let lastError = null
  // A local model server can be busy or briefly unavailable. A coding agent that
  // dies on one refused connection is not an agent.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 300_000)
    try {
      const response = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!response.ok) throw new Error(`ollama HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`)
      const payload = await response.json()
      return payload?.message?.content ?? ''
    } catch (error) {
      clearTimeout(timer)
      lastError = error
      const wait = attempt * 1500
      process.stderr.write(`[agent] model call failed (${error.message}); retry ${attempt}/4 in ${wait} ms\n`)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw new Error(`model call failed after retries: ${lastError?.message ?? 'unknown error'}`)
}

function runCommand({ command, args, cwd, timeoutMs = 120_000 }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: { PATH: process.env.PATH ?? '', ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' } : {}) },
    })
    let output = ''
    child.stdout.on('data', (chunk) => { if (output.length < MAX_OUTPUT * 4) output += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { if (output.length < MAX_OUTPUT * 4) output += chunk.toString('utf8') })
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, output: `${output}\n[timed out after ${timeoutMs} ms]` }) }, timeoutMs)
    child.on('error', (error) => { clearTimeout(timer); resolve({ code: -1, output: `spawn failed: ${error.message}` }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, output: output.slice(-MAX_OUTPUT) }) })
  })
}

function safePath(workspace, target) {
  const resolved = path.resolve(workspace, target)
  const relative = path.relative(path.resolve(workspace), resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`path escapes the workspace: ${target}`)
  return resolved
}

export function systemPrompt(allowedPaths) {
  return [
    'You are a coding agent that repairs one defect in a repository.',
    'You work through tools and you verify every change by running the acceptance check.',
    '',
    'You reply with exactly ONE JSON object per turn. Examples of a valid reply:',
    '  {"tool":"run_check"}',
    '  {"tool":"list_files","path":"test"}',
    '  {"tool":"grep","pattern":"restoreFromSnapshot"}',
    '  {"tool":"read_file","path":"src/executor/workspace.js"}',
    '  {"tool":"patch_file","path":"src/executor/workspace.js","old":"the exact current text","new":"the replacement text"}',
    '  {"tool":"write_file","path":"src/executor/workspace.js","content":"export const a = 1\\n"}',
    '  {"tool":"finish","summary":"read the file as bytes instead of text"}',
    '',
    'Tools:',
    '  list_files(path)            — list the files in a directory',
    '  grep(pattern)               — find text across the repository (pattern is a regex)',
    '  read_file(path)             — read a file from the repository',
    '  patch_file(path, old, new)  — replace one exact snippet of a file',
    '  write_file(path, content)   — overwrite a file with the COMPLETE new content',
    '  run_check()                 — run the acceptance check and read its output',
    '  finish(summary)             — you are done',
    '',
    'Rules:',
    `- You may only write to: ${allowedPaths.join(', ')}.`,
    '- Do not guess file names. Run the check, then use list_files and grep to find',
    '  the file that actually failed, and read that file.',
    '- Prefer patch_file: copy "old" exactly from the file you read, with enough surrounding',
    '  context to be unique, and put only the changed part in "new".',
    '- write_file replaces the whole file. Send the complete corrected content, never a diff or a fragment.',
    '- Read the failing test and the implementation before you change anything.',
    '- Change the smallest thing that makes the check pass. Do not rewrite unrelated code.',
    '- Run run_check after your first edit. If it still fails, read the new output and fix again.',
    '- Never claim the check passes unless you saw it pass.',
    '- Finish only after run_check returned exit code 0, or when you are convinced it cannot pass.',
  ].join('\n')
}

function userPrompt(payload) {
  const spec = payload.spec ?? {}
  const goal = payload.goal ?? {}
  const verification = payload.verification ?? []
  const lines = [
    `Task: ${goal.title ?? 'repair the defect'}`,
    '',
    'Requirement:',
    spec.summary ?? '(no summary provided)',
    '',
    `Workspace: ${payload.workspace}`,
    '',
    'The acceptance check you must satisfy:',
  ]
  for (const check of verification) {
    if (check.missing) { lines.push('  (no command profile registered for this check)'); continue }
    lines.push(`  ${check.command} ${(check.args ?? []).join(' ')}`)
  }
  if (payload.feedback) {
    lines.push('', 'The previous attempt failed. Here is its output:', '```', payload.feedback.failedCheck ?? '', '```')
  } else {
    lines.push('', 'Start by running the acceptance check to see the current failure.')
  }
  lines.push('', 'Begin. Emit one JSON object.')
  return lines.join('\n')
}

function summarizeCheck(output, code) {
  // The same condensation the kernel uses, so the agent sees exactly what the
  // kernel would hand to any builder.
  const text = [
    `exit code ${code}`,
    '--- failures ---',
    summarizeFailures(output, 4000),
  ].join('\n');
  return text.length > 6000 ? `${text.slice(0, 6000)}\n[truncated]` : text;
}

/**
 * Locates the snippet to replace.
 *
 * Exact copying of a long snippet is where small models fail, and the usual
 * failure is whitespace. Matching is therefore tried from strict to forgiving,
 * and the tool tells the agent which rule matched so it can adapt.
 */
export function locateSnippet(current, oldText) {
  const exact = current.indexOf(oldText);
  if (exact >= 0) return { index: exact, mode: 'exact' };

  const normalize = (value) => value.replace(/\s+/g, ' ').trim();
  const target = normalize(oldText);
  if (!target) return null;

  const lines = current.split('\n');
  const oldLines = oldText.split('\n');
  const width = oldLines.length;
  for (let start = 0; start + width <= lines.length; start += 1) {
    const block = normalize(lines.slice(start, start + width).join('\n'));
    if (block === target) {
      return { index: lines.slice(0, start).join('\n').length + (start ? 1 : 0), mode: 'normalized' };
    }
  }
  for (let start = 0; start < lines.length; start += 1) {
    if (normalize(lines[start]) === target) {
      return { index: lines.slice(0, start).join('\n').length + (start ? 1 : 0), mode: 'line' };
    }
  }
  return null;
}

async function main() {
  const raw = await readStdin()
  const payload = JSON.parse(raw)
  const maxSteps = Number(payload.maxSteps ?? process.env.UNTIL_AGENT_STEPS ?? DEFAULT_STEPS)
  const workspace = path.resolve(payload.workspace ?? process.cwd())
  const spec = payload.spec ?? {}
  const checks = (payload.verification ?? []).filter((check) => !check.missing)
  const allowedPaths = payload.allowedPaths ?? []
  const written = new Map()

  const messages = [
    { role: 'system', content: systemPrompt(allowedPaths) },
    { role: 'user', content: userPrompt(payload) },
  ]

  const transcript = []
  let finished = null

  for (let step = 1; step <= maxSteps; step += 1) {
    const reply = await chat(messages)
    let action
    try { action = normalizeAction(parseJson(reply)) }
    catch (error) {
      messages.push({ role: 'assistant', content: reply })
      messages.push({ role: 'user', content: `That was not valid JSON (${error.message}). Emit one JSON object with a "tool" field.` })
      transcript.push({ step, tool: 'parse_error', reply: reply.slice(0, 800) })
      continue
    }

    const tool = action.tool
    if (tool === 'finish' || tool === 'done' || tool === 'final') {
      finished = action.summary ?? action.notes ?? 'done'
      transcript.push({ step, tool: 'finish', summary: String(finished).slice(0, 800) })
      break
    }

    let observation
    if (tool === 'list_files') {
      // Without discovery an agent guesses file names and burns its whole budget.
      try {
        const target = path.resolve(workspace, action.path ?? '.')
        const relative = path.relative(path.resolve(workspace), target)
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('path escapes the workspace')
        const entries = await readdir(target, { withFileTypes: true })
        observation = entries
          .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
          .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
          .join('\n') || '(empty)'
      } catch (error) { observation = `ERROR: ${error.message}` }
      transcript.push({ step, tool: 'list_files', path: action.path ?? '.' })
    } else if (tool === 'grep') {
      try {
        const pattern = new RegExp(action.pattern ?? '.', 'i')
        const hits = []
        for (const file of await listWorkspaceFiles(workspace)) {
          if (hits.length >= 60) break
          if (!/\.(js|mjs|cjs|ts|tsx|json|md|py|go|rs|java|kt)$/i.test(file)) continue
          let content
          try { content = await readFile(path.join(workspace, file), 'utf8') } catch { continue }
          content.split('\n').forEach((line, index) => {
            if (hits.length < 60 && pattern.test(line)) hits.push(`${file}:${index + 1}: ${line.trim().slice(0, 200)}`)
          })
        }
        observation = hits.join('\n') || '(no matches)'
      } catch (error) { observation = `ERROR: ${error.message}` }
      transcript.push({ step, tool: 'grep', pattern: action.pattern })
    } else if (tool === 'read_file') {
      if (!action.path) {
        observation = 'ERROR: the read_file call needs a "path" field. Example: {"tool":"read_file","path":"src/executor/workspace.js"}'
      } else {
        try {
          const file = safePath(workspace, action.path)
          const content = await readFile(file, 'utf8')
          observation = content.length > MAX_FILE ? `${content.slice(0, MAX_FILE)}\n[truncated]` : content
        } catch (error) { observation = `ERROR: ${error.message}` }
      }
      transcript.push({ step, tool: 'read_file', path: action.path, bytes: observation.length })
    } else if (tool === 'patch_file') {
      // An exact replacement keeps the answer small and the change auditable.
      if (!action.path || typeof action.old !== 'string' || typeof action.new !== 'string') {
        observation = 'ERROR: patch_file needs "path", "old" and "new". "old" must be copied from the file you read.'
      } else {
        try {
          if (!allowedPaths.length || !allowedPaths.includes(action.path)) throw new Error(`path is not in the allowlist: ${action.path}`)
          const file = safePath(workspace, action.path)
          const current = await readFile(file, 'utf8')
          const found = locateSnippet(current, action.old)
          if (!found) throw new Error('the "old" text was not found in the file — copy it exactly from the file you read')
          const next = current.slice(0, found.index) + action.new + current.slice(found.index + action.old.length)
          if (next === current) throw new Error('the replacement is identical to the current text — nothing changed')
          await writeFile(file, next, 'utf8')
          written.set(action.path, next)
          observation = `patched ${action.path} at offset ${found.index} (match: ${found.mode}). Now run the check.`
        } catch (error) { observation = `ERROR: ${error.message}` }
      }
      transcript.push({ step, tool: 'patch_file', path: action.path, ok: !observation.startsWith('ERROR') })
    } else if (tool === 'write_file') {
      if (!action.path || typeof action.content !== 'string') {
        observation = 'ERROR: write_file needs both "path" and "content" (the complete new file content). Example: {"tool":"write_file","path":"src/a.js","content":"export const a = 1\\n"}'
      } else {
        try {
          if (!allowedPaths.length || !allowedPaths.includes(action.path)) throw new Error(`path is not in the allowlist: ${action.path}`)
          const file = safePath(workspace, action.path)
          await mkdir(path.dirname(file), { recursive: true })
          await writeFile(file, action.content, 'utf8')
          written.set(action.path, action.content)
          observation = `written ${action.path} (${action.content.length} chars). Now run the check.`
        } catch (error) { observation = `ERROR: ${error.message}` }
      }
      transcript.push({ step, tool: 'write_file', path: action.path, ok: !observation.startsWith('ERROR') })
    } else if (tool === 'run_check') {
      if (!checks.length) observation = 'ERROR: no acceptance command is registered'
      else {
        const check = checks[0]
        const result = await runCommand({ command: check.command, args: check.args, cwd: workspace, timeoutMs: check.timeoutMs ?? 120_000 })
        observation = summarizeCheck(result.output, result.code)
      }
      transcript.push({ step, tool: 'run_check' })
    } else {
      observation = `ERROR: unknown tool "${tool}". Use read_file, write_file, run_check or finish.`
      transcript.push({ step, tool: String(tool), error: true })
    }

    messages.push({ role: 'assistant', content: reply })
    messages.push({ role: 'user', content: `RESULT of ${tool}:\n${observation}\n\nEmit your next JSON object.` })
    const last = transcript[transcript.length - 1]
    if (last) {
      last.observation = String(observation).slice(0, 400)
      last.reply = reply.slice(0, 600)
    }
  }

  const edits = [...written.entries()].map(([file, content]) => ({ path: file, content }))
  const summary = transcript
    .map((entry) => `${entry.step}:${entry.tool}${entry.path ? `(${entry.path})` : ''}`)
    .join(' → ')
  process.stdout.write(JSON.stringify({
    status: finished ? 'done' : 'budget_exhausted',
    notes: finished
      ? String(finished)
      : `the step budget ran out before the agent finished. steps: ${summary}`,
    model: MODEL,
    steps: transcript.length,
    edits,
    transcript,
  }))
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\//,''))
if (isEntryPoint) main().catch((error) => {
  process.stdout.write(JSON.stringify({ status: 'error', notes: String(error?.message ?? error), edits: [] }))
  process.exitCode = 1
})
