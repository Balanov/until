import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { Copy, Language } from '../i18n'

const initial = { cycles: 40, hours: 24, rate: 50, eligible: 40, review: 80, infra: 1500, passRate: 80 }
type Assumptions = typeof initial

export function PilotCalculator({ copy, language }: { copy: Copy; language: Language }) {
  const [values, setValues] = useState<Assumptions>(initial)
  const [currency, setCurrency] = useState('USD')
  const set = (key: keyof Assumptions, value: number, min: number, max: number) => {
    setValues((current) => ({ ...current, [key]: Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)) }))
  }
  const money = (value: number) => new Intl.NumberFormat(language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  const scopedCycles = values.cycles * values.eligible / 100
  const currentCost = scopedCycles * values.hours * values.rate
  const pilotCost = values.review * values.rate + values.infra
  const attempts = scopedCycles / (values.passRate / 100)
  const fields: { key: keyof Assumptions; label: string; min: number; max: number; step?: number; suffix?: string }[] = [
    { key: 'cycles', label: copy.cycles, min: 1, max: 100000 },
    { key: 'hours', label: copy.hours, min: 0, max: 10000 },
    { key: 'rate', label: copy.rate, min: 0, max: 100000 },
    { key: 'eligible', label: copy.eligible, min: 1, max: 100, suffix: '%' },
    { key: 'review', label: copy.review, min: 0, max: 100000 },
    { key: 'infra', label: copy.infra, min: 0, max: 100000000 },
    { key: 'passRate', label: copy.passRate, min: 1, max: 100, suffix: '%' },
  ]
  return (
    <div className="calculator">
      <div className="calculator-inputs">
        {fields.map((field) => (
          <label className="calc-field" key={field.key}>
            <span>{field.label}</span>
            <span className="calc-input"><input type="number" value={values[field.key]} min={field.min} max={field.max} step={field.step ?? 1} onChange={(event) => set(field.key, Number(event.target.value), field.min, field.max)} />{field.suffix && <b>{field.suffix}</b>}</span>
          </label>
        ))}
        <label className="calc-field currency-field"><span>{copy.currencyNote}</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option>USD</option><option>EUR</option><option>RUB</option></select></label>
      </div>
      <div className="calculator-output" aria-live="polite">
        <div><span>{copy.currentCost}</span><strong>{money(currentCost)}</strong></div>
        <div><span>{copy.pilotCost}</span><strong>{money(pilotCost)}</strong></div>
        <div className="scenario-delta"><span>{copy.delta}</span><strong>{money(currentCost - pilotCost)}</strong></div>
        <div className="attempt-readout"><span>{copy.attempts}</span><strong>{attempts.toFixed(1)}</strong></div>
        <p>{copy.scenarioNote}</p>
        <button type="button" className="reset-button" onClick={() => { setValues(initial); setCurrency('USD') }}><RotateCcw size={15} />{copy.reset}</button>
      </div>
    </div>
  )
}
