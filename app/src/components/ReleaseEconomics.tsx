import { useMemo, useState } from 'react'
import type { Copy } from '../i18n'

const DEFAULT_STATE = {
  releases: 40,
  firstTryRate: 60,
  attempts: 2,
  monthlyInfra: 60000,
  reviewHours: 40,
  reviewRate: 4000,
}

/**
 * The cost of one accepted release — arithmetic on the operator's own numbers.
 *
 * The model is stated on the page so the numbers can be argued with:
 *
 *   • A task is accepted on the first attempt with probability p.
 *   • Otherwise the flow retries, up to a attempts per task (the budget).
 *   • A task that burns the whole budget without acceptance is rejected.
 *   • Infrastructure is charged per attempt, human review per accepted release.
 *
 * Because of that, accepted × cost-per-release + rejected work is exactly the
 * monthly total. Nothing here converts into a headcount claim: the panel says
 * what the flow costs, not what to cut.
 */
export function ReleaseEconomics({ copy }: { copy: Copy }) {
  const [state, setState] = useState(DEFAULT_STATE)

  const result = useMemo(() => {
    const tasks = Math.max(0, state.releases)
    const p = Math.min(100, Math.max(0, state.firstTryRate)) / 100
    const budget = Math.max(1, state.attempts)
    const q = 1 - p

    // Probability that a task is accepted within the attempt budget: 1 - (1-p)^a
    const neverAccepted = Math.pow(q, budget)
    const accepted = tasks * (1 - neverAccepted)

    // Expected attempts per task: sum of P(the task still needs attempt k).
    const expectedAttemptsPerTask = p >= 1 ? 1 : p <= 0 ? budget : (1 - neverAccepted) / p
    const totalAttempts = tasks * expectedAttemptsPerTask

    // A rejected task burned its whole budget; every other attempt led somewhere.
    const attemptsRejected = tasks * neverAccepted * budget
    const attemptsAccepted = Math.max(0, totalAttempts - attemptsRejected)

    const infra = Math.max(0, state.monthlyInfra)
    const review = Math.max(0, state.reviewHours * state.reviewRate)
    const total = infra + review

    const infraPerAttempt = totalAttempts > 0 ? infra / totalAttempts : 0
    const reviewPerAccepted = accepted > 0 ? review / accepted : 0
    const costPerRelease =
      accepted > 0 ? (attemptsAccepted * infraPerAttempt) / accepted + reviewPerAccepted : 0
    const waste = attemptsRejected * infraPerAttempt

    return { accepted, costPerRelease, waste, total }
  }, [state])

  const set = (key: keyof typeof DEFAULT_STATE) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    const value = raw === '' ? 0 : Number(raw)
    setState((previous) => ({ ...previous, [key]: Number.isFinite(value) ? value : previous[key] }))
  }

  const money = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(value))
  const count = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)

  return (
    <div className="economics">
      <div className="economics-copy">
        <span className="section-kicker">{copy.economicsKicker}</span>
        <h3>{copy.economicsTitle}</h3>
        <p>{copy.economicsBody}</p>
        <p className="economics-model">{copy.economicsModel}</p>
      </div>
      <div className="economics-grid">
        <div className="economics-inputs">
          <label>
            <span>{copy.releasesPerMonth}</span>
            <input type="number" min={0} value={state.releases} onChange={set('releases')} />
          </label>
          <label>
            <span>{copy.firstTryRate}</span>
            <input type="number" min={0} max={100} step={5} value={state.firstTryRate} onChange={set('firstTryRate')} />
          </label>
          <label>
            <span>{copy.attemptsPerTask}</span>
            <input type="number" min={1} max={20} value={state.attempts} onChange={set('attempts')} />
          </label>
          <label>
            <span>{copy.monthlyInfra}</span>
            <input type="number" min={0} step={5000} value={state.monthlyInfra} onChange={set('monthlyInfra')} />
          </label>
          <label>
            <span>{copy.reviewHours}</span>
            <input type="number" min={0} value={state.reviewHours} onChange={set('reviewHours')} />
          </label>
          <label>
            <span>{copy.reviewRate}</span>
            <input type="number" min={0} step={500} value={state.reviewRate} onChange={set('reviewRate')} />
          </label>
          <button type="button" className="economics-reset" onClick={() => setState(DEFAULT_STATE)}>
            {copy.reset}
          </button>
        </div>
        <div className="economics-output">
          <span className="economics-output-title">{copy.outputsTitle}</span>
          <div className="economics-row is-primary">
            <strong>{count(result.accepted)}</strong>
            <span>{copy.outReleases}</span>
          </div>
          <div className="economics-row">
            <strong>{money(result.costPerRelease)} ₽</strong>
            <span>{copy.outCostPerRelease}</span>
          </div>
          <div className="economics-row">
            <strong>{money(result.waste)} ₽</strong>
            <span>{copy.outWasted}</span>
          </div>
          <div className="economics-row">
            <strong>{money(result.total)} ₽</strong>
            <span>{copy.outTotal}</span>
          </div>
          <p className="economics-note">{copy.economicsNote}</p>
        </div>
      </div>
    </div>
  )
}
