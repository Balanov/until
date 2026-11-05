import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, Check, Clipboard, ClipboardCheck, Download, Github, ShieldCheck } from 'lucide-react'
import { LogoLockup, LogoMark } from './components/Logo'
import { ProofReplay } from './components/ProofReplay'
import { languages, translations, type Language } from './i18n'

const QUICK_START = `git clone https://github.com/Balanov/until.git
cd until
npm ci --ignore-scripts
npm test
npm run proof
node bin/until.mjs demo`

interface ProofData {
  passed: number
  total: number
  metrics: {
    realCycleTasks: number
    realEventCount: number
    heldoutBaselineCorrect: string
    heldoutCandidateCorrect: string
  }
}

interface TestData { passed: number; tests: number }
interface BenchmarkData {
  drain: { medianMs: number }
  startup: { medianMs: number }
}

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

function preferredLanguage(): Language {
  const saved = localStorage.getItem('until-language')
  if (languages.some((item) => item.id === saved)) return saved as Language
  const browser = navigator.language.toLowerCase().split('-')[0]
  return languages.some((item) => item.id === browser) ? browser as Language : 'en'
}

export default function App() {
  const [language, setLanguage] = useState<Language>(preferredLanguage)
  const [proof, setProof] = useState<ProofData | null>(null)
  const [tests, setTests] = useState<TestData | null>(null)
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle')
  const copy = translations[language]
  const direction = languages.find((item) => item.id === language)?.dir ?? 'ltr'

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = direction
    document.title = copy.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', copy.description)
    localStorage.setItem('until-language', language)
  }, [copy, direction, language])

  useEffect(() => {
    let active = true
    Promise.all([
      fetch(asset('proof.json')).then((response) => response.ok ? response.json() : Promise.reject(new Error('proof'))),
      fetch(asset('tests.json')).then((response) => response.ok ? response.json() : Promise.reject(new Error('tests'))),
      fetch(asset('benchmarks.json')).then((response) => response.ok ? response.json() : Promise.reject(new Error('benchmarks'))),
    ]).then(([proofData, testData, benchmarkData]) => {
      if (!active) return
      setProof(proofData)
      setTests(testData)
      setBenchmark(benchmarkData)
    }).catch(() => {
      // The replay remains usable even if summary metrics cannot be loaded.
    })
    return () => { active = false }
  }, [])

  const copyCommands = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(QUICK_START)
      } else {
        const area = document.createElement('textarea')
        area.value = QUICK_START
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const copied = document.execCommand('copy')
        area.remove()
        if (!copied) throw new Error('copy failed')
      }
      setCopyState('success')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header container">
        <a className="brand-link" href="#main" aria-label="UNTIL home"><LogoLockup /></a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#proof">{copy.nav.proof}</a>
          <a href="#manifest">{copy.nav.manifest}</a>
          <a href="#architecture">{copy.nav.architecture}</a>
        </nav>
        <div className="header-actions">
          <label className="language-picker">
            <span className="sr-only">Language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
              {languages.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
            </select>
          </label>
          <a className="github-link" href="https://github.com/Balanov/until" target="_blank" rel="noreferrer">
            <Github size={17} /> <span>{copy.source}</span><ArrowUpRight size={14} />
          </a>
          <a className="header-start" href="#start">{copy.nav.start}<ArrowDownToLine size={15} /></a>
        </div>
      </header>

      <main id="main">
        <section className="hero container" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="hero-kicker">{copy.heroKicker}</p>
            <h1 id="hero-title"><span>{copy.heroA}</span><strong>{copy.heroB}</strong></h1>
            <p className="hero-body">{copy.heroBody}</p>
            <p className="hero-note"><ShieldCheck size={20} /> <span>{copy.heroNote}</span></p>
            <div className="hero-signature" aria-hidden="true">
              <span>SIGNAL</span><i /> <span>PROOF</span><i /> <span>OUTCOME</span><i /> <span>REPEAT</span>
            </div>
          </div>
          <ProofReplay copy={copy} />
        </section>

        <section className="manifest-section" id="manifest" aria-labelledby="manifest-title">
          <div className="container">
            <div className="section-heading inverse">
              <span className="section-code">MANIFEST / 001</span>
              <h2 id="manifest-title">{copy.manifestTitle}</h2>
              <p>{copy.manifestBody}</p>
            </div>
            <div className="principles-grid">
              {copy.principles.map((principle) => (
                <article className="principle" key={principle.title}>
                  <Check size={19} />
                  <h3>{principle.title}</h3>
                  <p>{principle.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="architecture-section container" id="architecture" aria-labelledby="architecture-title">
          <div className="section-heading split-heading">
            <div>
              <span className="section-code">CONTROL / CAPABILITIES</span>
              <h2 id="architecture-title">{copy.architectureTitle}</h2>
            </div>
            <p>{copy.architectureBody}</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{copy.role}</th><th>{copy.can}</th><th>{copy.cannot}</th></tr></thead>
              <tbody>
                {copy.roles.map((role) => (
                  <tr key={role.role}><th scope="row">{role.role}</th><td>{role.can}</td><td>{role.cannot}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="proof-section" id="proof" aria-labelledby="proof-title">
          <div className="container">
            <div className="section-heading split-heading">
              <div>
                <span className="section-code">EVIDENCE / RAW FILES</span>
                <h2 id="proof-title">{copy.proofTitle}</h2>
              </div>
              <p>{copy.proofBody}</p>
            </div>
            <div className="metrics-grid">
              <a className="metric" href={asset('tests.json')} download>
                <strong>{tests ? `${tests.passed}/${tests.tests}` : '—'}</strong><span>{copy.metricTests}</span><Download size={16} />
              </a>
              <a className="metric" href={asset('proof.json')} download>
                <strong>{proof ? `${proof.passed}/${proof.total}` : '—'}</strong><span>{copy.metricProof}</span><Download size={16} />
              </a>
              <a className="metric" href={asset('fixtures/real-run.json')} download>
                <strong>{proof?.metrics.realCycleTasks ?? '—'}</strong><span>{copy.metricCycle}</span><Download size={16} />
              </a>
              <a className="metric" href={asset('fixtures/real-run.json')} download>
                <strong>{proof?.metrics.realEventCount ?? '—'}</strong><span>{copy.metricEvents}</span><Download size={16} />
              </a>
              <a className="metric metric-wide" href={asset('proof.json')} download>
                <strong>{proof ? `${proof.metrics.heldoutBaselineCorrect} → ${proof.metrics.heldoutCandidateCorrect}` : '—'}</strong><span>{copy.metricEvolution}</span><Download size={16} />
              </a>
            </div>
            <p className="fixture-warning">{copy.fixtureWarning}</p>
            <div className="benchmark-block">
              <div>
                <span className="section-code">INTRINSIC / NOT A RANKING</span>
                <h3>{copy.benchmarkTitle}</h3>
                <p>{copy.benchmarkBody}</p>
                <a className="text-link" href={asset('benchmarks.json')} download>{copy.proofData}<Download size={15} /></a>
              </div>
              <div className="benchmark-numbers">
                <div><strong>{benchmark ? `${benchmark.drain.medianMs.toFixed(1)} ms` : '—'}</strong><span>{copy.benchmarkQueue}</span></div>
                <div><strong>{benchmark ? `${benchmark.startup.medianMs.toFixed(1)} ms` : '—'}</strong><span>{copy.benchmarkStartup}</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="rsi-section container" aria-labelledby="rsi-title">
          <div className="rsi-panel">
            <div className="rsi-copy">
              <span className="section-code">RSI / BOUNDED EVOLUTION</span>
              <h2 id="rsi-title">{copy.rsiTitle}</h2>
              <p>{copy.rsiBody}</p>
              <a className="text-link" href="https://github.com/Balanov/until/blob/main/docs/architecture.md" target="_blank" rel="noreferrer">
                {copy.nav.architecture}<ArrowUpRight size={15} />
              </a>
            </div>
            <ul className="rsi-rules">
              {copy.rsiRules.map((rule) => <li key={rule}><Check size={17} /> <span>{rule}</span></li>)}
            </ul>
          </div>
        </section>

        <section className="quick-section" id="start" aria-labelledby="quick-title">
          <div className="container quick-grid">
            <div className="quick-copy">
              <span className="section-code">ZERO TO PROOF / NODE 24+</span>
              <h2 id="quick-title">{copy.quickTitle}</h2>
              <p>{copy.quickBody}</p>
              <button className="button button-accent" type="button" onClick={copyCommands}>
                {copyState === 'success' ? <ClipboardCheck size={18} /> : <Clipboard size={18} />}
                {copyState === 'success' ? copy.copied : copyState === 'error' ? copy.copyFailed : copy.copy}
              </button>
            </div>
            <div className="code-window">
              <div className="code-topline"><span>TERMINAL / QUICK START</span><span>MIT</span></div>
              <pre><code>{QUICK_START}</code></pre>
            </div>
          </div>
        </section>

        <section className="boundaries-section container" aria-labelledby="boundaries-title">
          <div className="section-heading">
            <span className="section-code">BOUNDARIES / NO MAGIC</span>
            <h2 id="boundaries-title">{copy.boundariesTitle}</h2>
          </div>
          <div className="faq-list">
            {copy.faq.map((item, index) => (
              <details key={item.q} open={index === 0}>
                <summary>{item.q}<span aria-hidden="true">+</span></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div><LogoMark size={36} /><p>{copy.footer}</p></div>
          <div className="footer-links">
            <a href="https://github.com/Balanov/until" target="_blank" rel="noreferrer">GitHub<ArrowUpRight size={14} /></a>
            <a href="https://github.com/Balanov/until/blob/main/docs/market-research.md" target="_blank" rel="noreferrer">{copy.nav.proof}<ArrowUpRight size={14} /></a>
            <a href={asset('proof.json')} download>{copy.proofData}<Download size={14} /></a>
          </div>
          <p className="license-line">{copy.license}</p>
        </div>
      </footer>
    </div>
  )
}
