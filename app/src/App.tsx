import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronDown, Clipboard, ClipboardCheck, Download, Github, Star } from 'lucide-react'
import { LogoLockup } from './components/Logo'
import { EvidencePanel } from './components/EvidencePanel'
import { PilotCalculator } from './components/PilotCalculator'
import { ProductCyclePanel, type RepositoryProof } from './components/ProductCyclePanel'
import { capabilities, competitors, summaryOf, type Comparison } from './evidence'
import { languages, translations, type Language } from './i18n'

const QUICK_START = `git clone https://github.com/Balanov/until.git
cd until
npm ci --ignore-scripts
npm run check
npm run proof
node bin/until.mjs demo`
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

function preferredLanguage(): Language {
  const saved = localStorage.getItem('until-language')
  if (languages.some((item) => item.id === saved)) return saved as Language
  const browser = navigator.language.toLowerCase().split('-')[0]
  return languages.some((item) => item.id === browser) ? browser as Language : 'en'
}

export default function App() {
  const [language, setLanguage] = useState<Language>(preferredLanguage)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [repositoryProof, setRepositoryProof] = useState<RepositoryProof | null>(null)
  const [tests, setTests] = useState<{ passed: number; tests: number } | null>(null)
  const [proof, setProof] = useState<{ passed: number; total: number } | null>(null)
  const [repo, setRepo] = useState({ stars: 0, forks: 0, live: false })
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')
  const copy = translations[language]
  const direction = languages.find((item) => item.id === language)?.dir ?? 'ltr'
  const current = summaryOf(comparison, 'v0.2.0-candidate', 'until')
  const direct = summaryOf(comparison, 'v0.2.0-candidate', 'direct')
  const previous = summaryOf(comparison, 'v0.1.0-baseline', 'until')

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = direction
    document.title = copy.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', copy.description)
    localStorage.setItem('until-language', language)
  }, [copy, direction, language])

  useEffect(() => {
    let active = true
    const load = (name: string, apply: (value: any) => void) => fetch(asset(name))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(name)))
      .then((value) => { if (active) apply(value) }).catch(() => {})
    load('comparison.json', setComparison)
    load('fixtures/repository-run.json', setRepositoryProof)
    load('tests.json', setTests)
    load('proof.json', setProof)
    load('github-snapshot.json', (value) => {
      const until = value.repositories.find((item: { repo: string }) => item.repo === 'Balanov/until')
      if (until) setRepo({ stars: until.stars, forks: until.forks, live: false })
    })
    fetch('https://api.github.com/repos/Balanov/until', { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('github')))
      .then((value) => { if (active) setRepo({ stars: value.stargazers_count, forks: value.forks_count, live: true }) }).catch(() => {})
    return () => { active = false }
  }, [])

  const copyCommands = async () => {
    try {
      await navigator.clipboard.writeText(QUICK_START)
      setCopyState('success')
    } catch { setCopyState('error') }
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">{copy.skip}</a>
      <header className="site-header container">
        <a className="brand-link" href="#main" aria-label="UNTIL"><LogoLockup /></a>
        <nav className="main-nav" aria-label="UNTIL">
          <a href="#how">{copy.nav.how}</a><a href="#results">{copy.nav.results}</a><a href="#compare">{copy.nav.compare}</a><a href="#economics">{copy.nav.economics}</a>
        </nav>
        <div className="header-actions">
          <label className="language-picker"><span className="sr-only">{copy.language}</span><select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>{languages.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <a className="repo-counter" href="https://github.com/Balanov/until/stargazers" target="_blank" rel="noreferrer" title={repo.live ? copy.liveGithub : copy.snapshotGithub}><Github size={17} /><Star size={14} /><strong>{repo.stars}</strong><span>/ {repo.forks}</span></a>
          <a className="header-run" href="#start">{copy.nav.run}<ArrowDownToLine size={15} /></a>
        </div>
      </header>

      <main id="main">
        <section className="hero container">
          <div className="hero-copy">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.heroA}<strong>{copy.heroB}</strong></h1>
            <p className="hero-body">{copy.heroBody}</p>
            <p className="hero-note">{copy.heroNote}</p>
            <div className="hero-actions"><a className="button button-primary" href="#results">{copy.primary}<ArrowRight size={17} /></a><a className="button button-secondary" href="#start">{copy.secondary}<ArrowDownToLine size={17} /></a></div>
            <div className="trust-line">
              <a href="https://github.com/Balanov/until/actions" target="_blank" rel="noreferrer"><Check size={14} />{copy.ci}</a>
              <a href={asset('tests.json')} download><Check size={14} />{tests ? `${tests.passed}/${tests.tests}` : '—'} {copy.tests}</a>
              <a href={asset('proof.json')} download><Check size={14} />{proof ? `${proof.passed}/${proof.total}` : '—'} {copy.proofChecks}</a>
              <a href="https://github.com/Balanov/until/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT<ArrowUpRight size={13} /></a>
            </div>
          </div>
          <ProductCyclePanel data={repositoryProof} copy={copy} />
        </section>

        <section className="how-section container" id="how">
          <div className="section-heading horizontal"><div><span className="section-index">{copy.nav.how}</span><h2>{copy.howTitle}</h2></div><p>{copy.howBody}</p></div>
          <div className="work-table">
            <div className="work-table-head"><span>{copy.manual}</span><span>{copy.system}</span></div>
            {copy.workRows.map((row) => <div className="work-row" key={row.manual}><span>{row.manual}</span><strong>{row.system}</strong></div>)}
          </div>
          <div className="owner-boundary">
            <div><span className="owner-label">{copy.ownerLabel}</span><h3>{copy.ownerTitle}</h3><p>{copy.ownerBody}</p></div>
            <ul>{copy.ownerItems.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul>
          </div>
        </section>

        <section className="results-section" id="results">
          <div className="container">
            <div className="section-heading horizontal"><div><span className="section-index">{copy.nav.results}</span><h2>{copy.resultsTitle}</h2></div><p>{copy.resultsBody}</p></div>
            <div className="repository-proof">
              <div className="repository-story">
                <span className="proof-label"><Check size={15} />{copy.repositoryLabel}</span>
                <h3>{copy.repositoryTitle}</h3>
                <p>{copy.repositoryBody}</p>
                <div className="proof-stat-grid">
                  <div><strong>{repositoryProof ? `${repositoryProof.initial.completed}/${repositoryProof.tasks.length}` : '—'}</strong><span>{copy.roleTasks}</span></div>
                  <div><strong>{repositoryProof ? `${repositoryProof.verdict.checks.filter((item) => item.passed).length}/${repositoryProof.verdict.checks.length}` : '—'}</strong><span>{copy.acceptanceChecks}</span></div>
                  <div><strong>{repositoryProof?.release.receipt.workspace.files ?? '—'}</strong><span>{copy.filesReleased}</span></div>
                  <div><strong>{repositoryProof?.audit.count ?? '—'}</strong><span>{copy.auditEvents}</span></div>
                </div>
                <a className="proof-download" href={asset('fixtures/repository-run.json')} download>{copy.rawRepository}<Download size={15} /></a>
              </div>
              <div className="code-proof" aria-label={copy.repositoryTitle}>
                <div className="code-proof-top"><span>src/activation.js</span><span>REAL NODE TEST</span></div>
                <pre><code><span className="code-removed">− duplicate-entry</span>{'\n'}<span className="code-removed">− duplicate-entry</span>{'\n'}<span className="code-added">+ account → profile</span></code></pre>
                <div className="test-transition"><div><span>{copy.testBefore}</span><strong>FAIL · exit 1</strong></div><ArrowRight size={20} /><div><span>{copy.testAfter}</span><strong>{repositoryProof?.afterTest.output || '—'} · exit 0</strong></div></div>
                <p><Check size={14} />{copy.immutableCandidate}</p>
              </div>
            </div>

            <details className="benchmark-details">
              <summary><span><strong>{copy.benchmarkTitle}</strong><small>{copy.benchmarkBody}</small></span><span className="benchmark-summary-score">{previous && current ? `${previous.accepted}/${previous.total} → ${current.accepted}/${current.total}` : '—'}<ChevronDown size={18} /></span></summary>
              <div className="benchmark-content">
                <EvidencePanel data={comparison} copy={copy} />
                <div className="benchmark-facts">
                  <div><strong>{current ? `${(current.medianWallMs / 1000).toFixed(1)} s` : '—'}</strong><span>UNTIL · {copy.median}</span></div>
                  <div><strong>{direct ? `${(direct.medianWallMs / 1000).toFixed(1)} s` : '—'}</strong><span>{copy.direct} · {copy.median}</span></div>
                  <div><strong>{current ? `${current.medianModelCalls} → 1` : '—'}</strong><span>{copy.calls}</span></div>
                  <div><strong>{comparison ? `${comparison.directSpeedAdvantage.toFixed(1)}×` : '—'}</strong><span>{copy.directFaster}</span></div>
                </div>
                <p className="method-note">{copy.providerNote}</p>
                <div className="data-links"><a href={asset('comparison.json')} download>{copy.allData}<Download size={15} /></a><a href={asset('live-protocol.json')} download>{copy.protocol}<Download size={15} /></a><a href={asset('live-tasks.json')} download>{copy.tasks}<Download size={15} /></a><a href={asset('until-proof.zip')} download>{copy.bundle}<Download size={15} /></a></div>
              </div>
            </details>
          </div>
        </section>

        <section className="compare-section container" id="compare">
          <div className="section-heading horizontal"><div><span className="section-index">{copy.nav.compare}</span><h2>{copy.compareTitle}</h2></div><p>{copy.compareBody}</p></div>
          <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>{copy.capability}</th>{competitors.map((item) => <th key={item.id} className={item.id === 'until' ? 'until-column' : ''}><a href={item.url} target="_blank" rel="noreferrer">{item.name}<ArrowUpRight size={12} /></a></th>)}</tr></thead><tbody>{capabilities.map((row) => <tr key={row.id}><th scope="row">{copy[row.id]}</th>{competitors.map((product) => { const state = row.values[product.id]; return <td key={product.id} className={`capability-${state} ${product.id === 'until' ? 'until-column' : ''}`}><span className={`status-dot ${state}`} />{copy[state]}</td> })}</tr>)}</tbody></table></div>
          <div className="comparison-notes"><p>{copy.openNote} {copy.unknownNote}</p><p><strong>{copy.engineeringGap}</strong></p><a href="https://github.com/Balanov/until/blob/main/docs/market-research.md" target="_blank" rel="noreferrer">{copy.method}<ArrowUpRight size={14} /></a></div>
        </section>

        <section className="economics-section" id="economics"><div className="container"><div className="section-heading horizontal"><div><span className="section-index">{copy.nav.economics}</span><h2>{copy.economicsTitle}</h2></div><p>{copy.economicsBody}</p></div><PilotCalculator copy={copy} language={language} /></div></section>

        <section className="quick-section container" id="start"><div className="quick-copy"><span className="section-index">{copy.nav.run}</span><h2>{copy.quickTitle}</h2><p>{copy.quickBody}</p><button className="button button-primary" type="button" onClick={copyCommands}>{copyState === 'success' ? <ClipboardCheck size={17} /> : <Clipboard size={17} />}{copyState === 'success' ? copy.copied : copyState === 'error' ? copy.copyFailed : copy.copy}</button></div><div className="code-window"><div className="code-topline"><span>TERMINAL / LOCAL PROOF</span><span>MIT</span></div><pre><code>{QUICK_START}</code></pre></div></section>
      </main>

      <footer className="site-footer"><div className="container footer-grid"><div><LogoLockup /><p>{copy.footer}</p></div><div className="footer-links"><a href="https://github.com/Balanov/until" target="_blank" rel="noreferrer"><Github size={15} />{copy.source}<ArrowUpRight size={13} /></a><a href="https://github.com/Balanov/until/stargazers" target="_blank" rel="noreferrer"><Star size={14} />{repo.stars} {copy.stars} · {repo.forks} {copy.forks}</a><a href="https://github.com/Balanov/until/blob/main/docs/market-research.md" target="_blank" rel="noreferrer">{copy.method}<ArrowUpRight size={13} /></a></div><p className="license-line">{copy.license}</p></div></footer>
    </div>
  )
}
