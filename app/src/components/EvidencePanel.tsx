import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, Download, FileJson, LockKeyhole, ReceiptText, ShieldCheck } from 'lucide-react'
import type { Comparison, Trace } from '../evidence'
import { summaryOf } from '../evidence'
import type { Copy } from '../i18n'

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

export function EvidencePanel({ data, copy }: { data: Comparison | null; copy: Copy }) {
  const trials = data?.trials.filter((item) => item.label === 'v0.2.0-candidate' && item.suite === 'heldout' && item.system === 'until') ?? []
  const [selected, setSelected] = useState(0)
  const [trace, setTrace] = useState<Trace | null>(null)
  const [traceError, setTraceError] = useState(false)
  const trial = trials[selected]
  const current = summaryOf(data, 'v0.2.0-candidate', 'until')
  const previous = summaryOf(data, 'v0.1.0-baseline', 'until')
  const direct = summaryOf(data, 'v0.2.0-candidate', 'direct')

  useEffect(() => {
    if (!trial) return
    let active = true
    setTrace(null)
    setTraceError(false)
    fetch(asset(`${trial.trace}/result.json`))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('trace')))
      .then((value) => { if (active) setTrace(value) })
      .catch(() => { if (active) { setTrace(null); setTraceError(true) } })
    return () => { active = false }
  }, [trial?.trace])

  let feature = '—'
  try {
    if (trace?.artifact?.content) feature = JSON.parse(trace.artifact.content).implementation?.feature ?? '—'
  } catch { /* The raw trace remains available if an artifact is malformed. */ }

  return (
    <div className="evidence-panel" aria-label={copy.live}>
      <div className="evidence-topline">
        <span className="live-label"><i />{copy.live}</span>
        <span className="mono">QWEN3:8B</span>
      </div>
      <div className="acceptance-score">
        <strong>{current ? `${current.accepted}/${current.total}` : '—'}</strong>
        <span>{copy.accepted}</span>
      </div>
      <div className="score-bars">
        {[{ name: copy.baseline, data: previous }, { name: copy.current, data: current }, { name: copy.direct, data: direct }].map((row) => (
          <div className="score-row" key={row.name}>
            <span>{row.name}</span>
            <div className="score-track" aria-hidden="true"><i style={{ transform: `scaleX(${row.data ? row.data.accepted / row.data.total : 0})` }} /></div>
            <b>{row.data ? `${row.data.accepted}/${row.data.total}` : '—'}</b>
          </div>
        ))}
      </div>
      <p className="evidence-caption">{copy.model}</p>

      <div className="run-inspector">
        <div className="inspector-heading">
          <label htmlFor="trial-select">{copy.inspect}</label>
          {trial && <select id="trial-select" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
            {trials.map((item, index) => <option key={`${item.case}-${item.iteration}`} value={index}>{copy.runLabel} {index + 1} · {item.case}</option>)}
          </select>}
        </div>
        <div className="proof-line">
          <div><Check size={16} /><span>{copy.signal}</span></div>
          <div><LockKeyhole size={16} /><span>{copy.contract}</span></div>
          <div><ShieldCheck size={16} /><span>{copy.verdict}</span></div>
          <div><ReceiptText size={16} /><span>{copy.receipt}</span></div>
        </div>
        <div className="run-readout" aria-live="polite">
          <span className="mono">implementation.feature</span>
          <strong>{feature}</strong>
          <span>{trace ? `${trace.verdict?.checks.filter((check) => check.passed).length ?? 0}/${trace.verdict?.checks.length ?? 0} checks · ${trace.audit?.count ?? '—'} audit events` : traceError ? copy.unavailable : copy.loading}</span>
        </div>
        {trial && <div className="trace-actions">
          <a href={asset(`${trial.trace}/result.json`)} download><FileJson size={15} />{copy.downloadTrace}<Download size={14} /></a>
          <a href={asset(`${trial.trace}/responses.jsonl`)} download>{copy.rawResponses}<ArrowUpRight size={14} /></a>
        </div>}
      </div>
      <div className="evidence-foot"><ShieldCheck size={15} /><span>{copy.notSelfApproved}</span></div>
    </div>
  )
}
