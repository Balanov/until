import { Activity, ArrowUpRight, Check, Code2, FileCheck2, FlaskConical, PackageCheck, Search, ShieldCheck } from 'lucide-react'
import type { Copy } from '../i18n'

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

export interface RepositoryProof {
  beforeTest: { status: number; output: string }
  afterTest: { status: number; output: string }
  initial: { completed: number; failed: number; cycles: number }
  tasks: { id: string; role: string; kind: string; state: string; attempts: number }[]
  verdict: { passed: number; checks: { type: string; passed: boolean }[] }
  release: { id: string; status: string; receipt: { workspace: { files: number; bytes: number; hash: string } } }
  initialSource: string
  acceptedSource: string
  candidateSource: string
  audit: { valid: boolean; count: number; head: string }
}

export function ProductCyclePanel({ data, copy }: { data: RepositoryProof | null; copy: Copy }) {
  const icons = [Search, FileCheck2, Code2, ShieldCheck, PackageCheck, Activity]
  const checksPassed = data?.verdict.checks.filter((item) => item.passed).length ?? 0
  const details = [
    copy.cycleEvidence,
    copy.cycleContract,
    'src/activation.js',
    data ? `${checksPassed}/${data.verdict.checks.length} checks · ${data.afterTest.output}` : copy.loading,
    data ? `${data.release.receipt.workspace.files} ${copy.filesShort} · SHA-256` : copy.loading,
    copy.cycleObservation,
  ]
  return (
    <div className="cycle-panel" aria-label={copy.cycleLabel}>
      <div className="cycle-topline">
        <span><i />{copy.cycleLabel}</span>
        <strong>{data ? `${data.initial.completed}/${data.tasks.length}` : '—'}</strong>
      </div>
      <div className="cycle-goal">
        <span>{copy.cycleGoalLabel}</span>
        <strong>{copy.cycleGoal}</strong>
      </div>
      <div className="cycle-steps">
        {copy.cycleSteps.map((step, index) => {
          const Icon = icons[index]
          const done = Boolean(data?.tasks[index]?.state === 'done')
          return <div className="cycle-step" key={step}>
            <span className={`cycle-step-icon ${done ? 'is-done' : ''}`}>{done ? <Check size={15} /> : <Icon size={15} />}</span>
            <div><strong>{step}</strong><span>{details[index]}</span></div>
          </div>
        })}
      </div>
      <div className="cycle-proof">
        <div><span>{copy.testBefore}</span><strong className="test-fail">FAIL</strong></div>
        <div><span>{copy.testAfter}</span><strong>{data?.afterTest.output || '—'}</strong></div>
      </div>
      <div className="cycle-footer">
        <span><ShieldCheck size={15} />{copy.notSelfApproved}</span>
        <a href={asset('fixtures/repository-run.json')} download>{copy.rawRepository}<ArrowUpRight size={14} /></a>
      </div>
      <p className="cycle-mode"><FlaskConical size={13} />{copy.cycleMode}</p>
    </div>
  )
}
