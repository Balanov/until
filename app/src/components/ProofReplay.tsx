import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Circle, Download, LoaderCircle, LockKeyhole, Play, RotateCcw } from 'lucide-react'
import type { Copy } from '../i18n'

interface FixtureTask {
  id: string
  role: string
  kind: string
  state: string
  attempts: number
}

interface Fixture {
  title: string
  mode: string
  tasks: FixtureTask[]
  goal: { status: string }
  audit: { valid: boolean; count?: number; head?: string }
}

type Scenario = 'real' | 'synthetic'
type StageStatus = 'pending' | 'active' | 'done' | 'blocked' | 'skipped'

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

export function ProofReplay({ copy }: { copy: Copy }) {
  const [scenario, setScenario] = useState<Scenario>('real')
  const [fixtures, setFixtures] = useState<Partial<Record<Scenario, Fixture>>>({})
  const [loadError, setLoadError] = useState(false)
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(-1)
  const [blocked, setBlocked] = useState(false)
  const [runCount, setRunCount] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const reducedMotion = useRef(false)

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [realResponse, syntheticResponse] = await Promise.all([
        fetch(asset('fixtures/real-run.json')),
        fetch(asset('fixtures/synthetic-run.json')),
      ])
      if (!realResponse.ok || !syntheticResponse.ok) throw new Error('Fixture unavailable')
      const [real, synthetic] = await Promise.all([realResponse.json(), syntheticResponse.json()])
      setFixtures({ real, synthetic })
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    void load()
    return clearTimers
  }, [clearTimers, load])

  const reset = useCallback(() => {
    clearTimers()
    setRunning(false)
    setStep(-1)
    setBlocked(false)
  }, [clearTimers])

  useEffect(() => reset, [reset, scenario])

  const replay = () => {
    if (!fixtures[scenario]) return
    reset()
    setRunCount((value) => value + 1)
    if (reducedMotion.current) {
      if (scenario === 'synthetic') {
        setStep(1)
        setBlocked(true)
      } else {
        setStep(copy.stages.length)
      }
      return
    }
    setRunning(true)
    setStep(0)
    const delay = 520
    for (let index = 1; index < copy.stages.length; index += 1) {
      timers.current.push(setTimeout(() => {
        if (scenario === 'synthetic' && index === 2) {
          setStep(1)
          setBlocked(true)
          setRunning(false)
          clearTimers()
          return
        }
        setStep(index)
        if (index === copy.stages.length - 1) {
          timers.current.push(setTimeout(() => {
            setStep(copy.stages.length)
            setRunning(false)
          }, delay))
        }
      }, index * delay))
    }
  }

  const data = fixtures[scenario]
  const completed = scenario === 'synthetic' && blocked
  const realCompleted = scenario === 'real' && step >= copy.stages.length
  const finished = completed || realCompleted
  const doneCount = realCompleted ? copy.stages.length : Math.max(0, step + (blocked ? 1 : 0))
  const progress = finished && scenario === 'synthetic' ? 2 / copy.stages.length : doneCount / copy.stages.length
  const currentTask = step >= 1 && data?.tasks.length
    ? data.tasks[Math.min(step - 1, data.tasks.length - 1)]
    : null

  const statusFor = (index: number): StageStatus => {
    if (blocked) {
      if (index < 2) return 'done'
      if (index === 2) return 'blocked'
      return 'skipped'
    }
    if (index < step) return 'done'
    if (index === step && running) return 'active'
    if (realCompleted) return 'done'
    return 'pending'
  }

  const statusText = finished
    ? scenario === 'synthetic' ? copy.blocked : copy.achieved
    : blocked ? copy.waiting : currentTask ? `${currentTask.role} · ${currentTask.kind}` : copy.fixture

  return (
    <section className={`proof-console ${blocked ? 'is-blocked' : ''}`} aria-label={copy.replay} data-running={running}>
      <div className="console-topline">
        <span className="console-id">UNTIL / PROOF_REPLAY</span>
        <span className="console-mode">LOCAL · 0 API CALLS</span>
      </div>

      <div className="scenario-switch" role="group" aria-label={copy.real}>
        <button type="button" className={scenario === 'real' ? 'selected' : ''} onClick={() => setScenario('real')} aria-pressed={scenario === 'real'}>
          {copy.real}
        </button>
        <button type="button" className={scenario === 'synthetic' ? 'selected' : ''} onClick={() => setScenario('synthetic')} aria-pressed={scenario === 'synthetic'}>
          {copy.synthetic}
        </button>
      </div>

      <div className="proof-rail" role="list" aria-label={copy.stages.join(', ')}>
        {copy.stages.map((stage, index) => {
          const status = statusFor(index)
          return (
            <div className={`rail-stage ${status}`} role="listitem" key={stage} aria-current={status === 'active' ? 'step' : undefined}>
              <div className="rail-node" aria-hidden="true">
                {status === 'done' && <Check size={16} strokeWidth={2.5} />}
                {status === 'active' && <LoaderCircle size={16} className="spin" />}
                {status === 'blocked' && <LockKeyhole size={15} />}
                {(status === 'pending' || status === 'skipped') && <Circle size={12} />}
              </div>
              <div className="rail-copy">
                <strong>{stage}</strong>
                <span>{copy.stageDetails[index]}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="proof-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      <div className="console-readout" aria-live="polite" aria-atomic="true">
        <span className={`readout-dot ${finished && scenario === 'real' ? 'success' : ''}`} aria-hidden="true" />
        <div>
          <strong>{statusText}</strong>
          <span>{data?.title ?? copy.fixture}</span>
        </div>
      </div>

      <div className="console-actions">
        <button type="button" className="button button-dark" onClick={replay} disabled={!data || running}>
          {finished || runCount > 0 ? <RotateCcw size={18} /> : <Play size={18} />}
          {running ? copy.replaying : finished || runCount > 0 ? copy.replayAgain : copy.replay}
        </button>
        {data && (
          <a className="button button-quiet" href={asset(`fixtures/${scenario}-run.json`)} download>
            <Download size={17} /> {copy.download}
          </a>
        )}
        {loadError && <button type="button" className="button button-quiet" onClick={() => void load()}>{copy.replayAgain}</button>}
      </div>

      <div className="console-footnote">
        <span>{copy.fixture}</span>
        {finished && data?.audit.valid && <span className="audit-stamp"><Check size={14} /> {copy.auditOk}</span>}
      </div>
    </section>
  )
}
