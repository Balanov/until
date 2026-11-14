import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { Copy } from '../i18n'

export interface RepairRun {
  format: string
  title: string
  testBefore: { status: number; output: string }
  testAfter: { status: number; output: string }
  initial: { completed: number; failed: number; cycles: number }
  artifact: { id: string; status: string; repair: { passed: boolean; reason: string; attempts: number; trail: { attempt: number; passed: boolean; output: string }[] } | null }
  verdict: { passed: number; checks: { type: string; passed: boolean }[] } | null
  release: { id: string; status: string; files: number | null } | null
  audit: { valid: boolean; count: number }
}

function tail(value: string, lines = 9): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim())
    .slice(-lines)
    .join('\n')
}

/**
 * The hero console: the engine's own run, replayed.
 *
 * It shows the failing test, the builder seeing it, and the check going green.
 * The step cycles on its own, so the page demonstrates the loop instead of
 * describing it.
 */
export function RepairProof({ data, copy }: { data: RepairRun | null; copy: Copy }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setStep((value) => (value + 1) % 3), 4200)
    return () => clearInterval(timer)
  }, [])

  const panels = useMemo(() => {
    const failed = data ? tail(data.testBefore.output, 6) : '—'
    const passed = data ? tail(data.testAfter.output, 4) : '—'
    const verdict = data
      ? [
        `repair:      ${data.artifact?.repair?.reason ?? 'unknown'}`,
        `attempts:    ${data.artifact?.repair?.attempts ?? 0}`,
        `verdict:     ${data.verdict?.passed ?? 0} passed`,
        `release:     ${data.release?.status ?? 'none'}`,
        `audit:       ${data.audit?.valid ? 'valid' : 'broken'} (${data.audit?.count ?? 0} events)`,
      ].join('\n')
      : '—'
    return [failed, passed, verdict]
  }, [data])

  const labels = [copy.sandboxAttemptOne, copy.sandboxAttemptTwo, copy.sandboxVerdict]
  const states = ['exit 1', 'exit 0', 'accepted']

  // Exit codes come from the recorded run, never from a guess.
  const beforeStatus = data?.testBefore?.status ?? 1
  const afterStatus = data?.testAfter?.status ?? 0

  return (
    <div className="console" data-step={step}>
      <div className="console-top">
        <span className="console-title"><i />{copy.sandboxKicker}</span>
        <span className="console-state">{states[step]}</span>
      </div>
      <div className="console-command">
        <span>ПРОВЕРКА</span>
        <code>node --test test/*.test.mjs</code>
        <span className="console-pulse" />
      </div>
      <div className="console-out">
        <div className="console-out-head">
          <strong>{labels[step]}</strong>
          <span>{copy.sandboxFile}</span>
        </div>
        <pre>{panels[step]}</pre>
      </div>
      <div className="console-steps">
        <div className={`console-step${step === 0 ? ' is-active' : ''}`}>
          <b>{copy.sandboxAttemptOne}</b>
          <small>exit {beforeStatus} · тест упал</small>
        </div>
        <div className={`console-step${step === 1 ? ' is-active' : ''}`}>
          <b>{copy.sandboxAttemptTwo}</b>
          <small>exit {afterStatus} · тест зелёный</small>
        </div>
      </div>
      <p className="console-caption">{copy.sandboxResult}</p>
      <a className="console-action" href="fixtures/repair-run.json" target="_blank" rel="noreferrer">
        {copy.sandboxButton}<ArrowRight size={18} />
      </a>
      <span className="console-note">{copy.sandboxNote}</span>
    </div>
  )
}
