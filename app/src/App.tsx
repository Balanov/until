import { useEffect, useState } from 'react'
import { ArrowRight, ChevronDown, ExternalLink, Github, Mail } from 'lucide-react'
import { LogoLockup } from './components/Logo'
import { RepairProof, type RepairRun } from './components/RepairProof'
import { ReleaseEconomics } from './components/ReleaseEconomics'
import { languages, translations, type Language } from './i18n'

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

interface AgentRun {
  model: string
  elapsedMs: number
  run: { completed: number; failed: number }
  repair: { passed: boolean; reason: string; attempts: number; workspaceRestored: boolean } | null
  release: { id: string; status: string } | null
  verdict: { passed: number } | null
  audit: { valid: boolean; count: number }
}

interface TestReport { tests: number; passed: number }
interface ProofReport { total: number; passed: number }

function preferredLanguage(): Language {
  const saved = localStorage.getItem('until-language')
  if (languages.some((item) => item.id === saved)) return saved as Language
  const browser = navigator.language.toLowerCase().split('-')[0]
  return languages.some((item) => item.id === browser) ? (browser as Language) : 'ru'
}

export default function App() {
  const [language, setLanguage] = useState<Language>(preferredLanguage)
  const [repair, setRepair] = useState<RepairRun | null>(null)
  const [agent, setAgent] = useState<AgentRun | null>(null)
  const [repo, setRepo] = useState({ stars: 0, forks: 0, live: false })
  const [reports, setReports] = useState<{ tests: TestReport | null; proof: ProofReport | null }>({ tests: null, proof: null })
  const copy = translations[language]

  // The counts on the page come from the published reports, not from a string in
  // the source. If the reports cannot be fetched the static copy is the fallback.
  const testCounts = reports.tests ? `${reports.tests.passed}/${reports.tests.tests}` : null
  const proofCounts = reports.proof ? `${reports.proof.passed}/${reports.proof.total}` : null
  const metrics = copy.metrics.map(([value, title, note], index) => {
    if (index === 0 && testCounts) return [testCounts, title, note]
    if (index === 1 && proofCounts) return [proofCounts, title, note]
    return [value, title, note]
  })
  const repoStats = copy.repoStats
    .replace('{tests}', testCounts ?? copy.metrics[0][0])
    .replace('{proof}', proofCounts ?? copy.metrics[1][0])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = copy.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', copy.description)
    localStorage.setItem('until-language', language)
  }, [copy, language])

  useEffect(() => {
    let active = true
    const load = (name: string, apply: (value: any) => void) => fetch(asset(name))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(name))))
      .then((value) => { if (active) apply(value) })
      .catch(() => {})
    load('fixtures/repair-run.json', setRepair)
    load('fixtures/agent-run.json', setAgent)
    load('tests.json', (value: TestReport) => setReports((current) => ({ ...current, tests: value })))
    load('proof.json', (value: ProofReport) => setReports((current) => ({ ...current, proof: value })))
    fetch('https://api.github.com/repos/Balanov/until', { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('github'))))
      .then((value) => { if (active) setRepo({ stars: value.stargazers_count, forks: value.forks_count, live: true }) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // One observer for the whole page: sections surface as they enter the viewport.
  useEffect(() => {
    const targets = document.querySelectorAll('.reveal')
    if (!('IntersectionObserver' in window)) {
      targets.forEach((node) => node.classList.add('is-visible'))
      return
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    targets.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="page">
      <a className="skip-link" href="#main">{copy.skip}</a>

      <header className="topbar">
        <a className="brand" href="#main" aria-label="UNTIL"><LogoLockup /></a>
        <nav className="nav" aria-label="UNTIL">
          <a href="#value">{copy.nav.value}</a>
          <a href="#agent">{copy.nav.proof}</a>
          <a href="#security">{copy.nav.security}</a>
          <a href="#economics">{copy.nav.economics}</a>
        </nav>
        <div className="header-actions">
          <a className="github-icon" href="https://github.com/Balanov/until" target="_blank" rel="noreferrer" aria-label="GitHub">
            <Github size={21} />
          </a>
          <div className="language">
            {languages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === language ? 'is-active' : undefined}
                onClick={() => setLanguage(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <a className="header-download" href={copy.pilotMailto}>{copy.nav.pilot}</a>
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <span className="kicker"><span />{copy.eyebrow}</span>
            <h1>{copy.heroA}<br />{copy.heroB}</h1>
            <p className="hero-lead">{copy.heroLead}</p>
            <p className="hero-note">{copy.heroNote}</p>
            <div className="hero-actions">
              <a className="button button-primary" href={copy.pilotMailto}>{copy.primary}<ArrowRight size={19} /></a>
              <a className="button button-secondary" href="#value">{copy.secondary}<ChevronDown size={19} /></a>
            </div>
            <div className="release-meta">
              <span>{copy.releaseMeta}</span>
              <a href="https://github.com/Balanov/until" target="_blank" rel="noreferrer">{copy.releaseMetaLink}</a>
            </div>
            <a className="repo-stats" href="https://github.com/Balanov/until/actions" target="_blank" rel="noreferrer">
              <Github size={15} />
              <strong>{repoStats}</strong>
              {repo.live ? <span>· {repo.stars} ★ · {repo.forks} forks</span> : null}
            </a>
          </div>
          <RepairProof data={repair} copy={copy} />
        </section>

        <section className="section" id="value">
          <div className="section-intro reveal">
            <span className="section-kicker">{copy.valueKicker}</span>
            <h2>{copy.valueTitle}</h2>
            <p>{copy.valueBody}</p>
          </div>
          <div className="feature-grid">
            {copy.valueCards.map((card, index) => (
              <article className={`feature-card${index === 0 ? ' is-featured' : ''} reveal`} key={card.title}>
                <div className="feature-icon" aria-hidden="true"><span /><span /><span /></div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <code>→ {card.link}</code>
              </article>
            ))}
          </div>
        </section>

        <section className="section section-alt">
          <div className="role-split">
            <div className="section-intro reveal">
              <span className="section-kicker">{copy.rolesKicker}</span>
              <h2>{copy.rolesTitle}</h2>
              <p>{copy.rolesBody}</p>
            </div>
            <div className="role-grid">
              {copy.roles.map(([role, system, human]) => (
                <article className="role-block reveal" key={role}>
                  <h3>{role}</h3>
                  <p className="role-system">{system}</p>
                  <p>{human}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="agent">
          <div className="run-split">
            <div className="section-intro reveal">
              <span className="section-kicker">{copy.agentKicker}</span>
              <h2>{copy.agentTitle}</h2>
              <p>{copy.agentBody}</p>
              <a className="arrow-link" href="fixtures/agent-run.json" target="_blank" rel="noreferrer">{copy.agentLink}</a>
              {agent ? (
                <div className="run-facts">
                  <span>model <strong>{agent.model}</strong></span>
                  <span>attempts <strong>{agent.repair?.attempts ?? 0}</strong></span>
                  <span>restored <strong>{agent.repair?.workspaceRestored ? 'yes' : 'no'}</strong></span>
                  <span>audit <strong>{agent.audit?.valid ? 'valid' : 'broken'}</strong></span>
                </div>
              ) : null}
              <p className="run-note">{copy.agentNote}</p>
            </div>
            <div className="log-stack">
              {copy.agentSteps.map(([title, code], index) => (
                <div className={`log-card${index === 0 ? ' is-fail' : index === 2 ? ' is-ok' : ''} reveal`} key={title}>
                  <div className="log-head">
                    <span>{title}</span>
                    <code>{['FAIL', 'AGENT', 'KERNEL'][index] ?? 'TRACE'}</code>
                  </div>
                  <pre>{code}</pre>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="invert" id="security">
          <div className="invert-panel reveal">
            <div>
              <span className="section-kicker">{copy.securityKicker}</span>
              <h2>{copy.securityTitle}</h2>
              <p>{copy.securityBody}</p>
              <ul className="invert-list">
                {copy.securityList.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p className="invert-ci">{copy.securityCi}</p>
            </div>
            <div className="invert-side">
              <div className="invert-window">
                <div className="invert-window-head">
                  {copy.securityPanelTitle}
                  <span>fail-closed</span>
                </div>
                <pre>{copy.securityPanel.join('\n')}</pre>
              </div>
              <div className="invert-policy">
                <div className="invert-policy-head">
                  <b>{copy.securityPolicyTitle}</b>
                  <span>{copy.securityPolicyNote}</span>
                </div>
                <dl>
                  {copy.securityPolicy.map(([field, meaning]) => (
                    <div key={field}>
                      <dt>{field}</dt>
                      <dd>{meaning}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="economics">
          <div className="section-intro reveal">
            <span className="section-kicker">{copy.metricsKicker}</span>
            <h2>{copy.metricsTitle}</h2>
          </div>
          <div className="metric-grid">
            {metrics.map(([value, title, note]) => (
              <article className="metric-card reveal" key={title}>
                <strong>{value}</strong>
                <span>{title}</span>
                <small>{note}</small>
              </article>
            ))}
          </div>
          <ReleaseEconomics copy={copy} />
        </section>

        <section className="section section-alt">
          <div className="faq">
            <div className="section-intro reveal">
              <span className="section-kicker">{copy.boundsKicker}</span>
              <h2>{copy.boundsTitle}</h2>
              <p>{copy.boundsBody}</p>
            </div>
            <div className="faq-list">
              {copy.bounds.map(([title, body]) => (
                <details key={title}>
                  <summary>{title}</summary>
                  <p>{body}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="closing reveal">
            <div>
              <h2>{copy.ctaTitle}</h2>
              <p>{copy.ctaBody}</p>
            </div>
            <div className="closing-actions">
              <a className="button button-primary" href={copy.pilotMailto}>{copy.ctaButton}<ArrowRight size={19} /></a>
              <a className="button button-secondary" href="https://github.com/Balanov/until" target="_blank" rel="noreferrer">
                {copy.ctaSecondary}<ExternalLink size={19} />
              </a>
              <div className="install-command">
                <code>{copy.ctaCommand}</code>
                <span>MIT</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#main" aria-label="UNTIL"><LogoLockup /></a>
        <span>{copy.footerNote}</span>
        <div>
          <a href="https://github.com/Balanov/until" target="_blank" rel="noreferrer">GitHub<ExternalLink size={14} /></a>
          <a href="https://github.com/Balanov/until/blob/main/docs/market-research.md" target="_blank" rel="noreferrer">{copy.footerLinks[1]}</a>
          <a href={copy.pilotMailto}><Mail size={14} />{copy.nav.pilot}</a>
        </div>
      </footer>
    </div>
  )
}
