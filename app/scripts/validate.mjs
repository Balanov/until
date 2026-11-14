import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { actualNodeBinary } from '../../scripts/node-binary.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const externalOrigin = process.env.UNTIL_SITE_ORIGIN?.replace(/\/+$/, '')
const out = path.join(root, '..', '.until', externalOrigin ? 'site-check-public' : 'site-check')
await mkdir(out, { recursive: true })
const origin = externalOrigin || 'http://127.0.0.1:7100'
const server = externalOrigin ? null : spawn(actualNodeBinary(), [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', '7100'], { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
let serverOutput = ''
if (server) {
  server.stdout.on('data', (chunk) => { serverOutput += chunk })
  server.stderr.on('data', (chunk) => { serverOutput += chunk })
}
async function stopServer() {
  if (!server || server.killed) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => { const killer = spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: false }); killer.on('close', resolve); killer.on('error', resolve) })
  } else server.kill('SIGTERM')
}
async function waitForServer() {
  let lastError = null
  for (let attempt = 0; attempt < (externalOrigin ? 3 : 100); attempt += 1) {
    try { const response = await fetch(origin, { signal: AbortSignal.timeout(10_000) }); if (response.ok) return; lastError = new Error(`HTTP ${response.status}`) }
    catch (error) { lastError = error }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Site is unavailable: ${lastError?.message || serverOutput}`)
}
const executablePath = process.env.CHROME_BIN || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => existsSync(candidate))
if (!executablePath) throw new Error('No Chrome/Edge executable found; set CHROME_BIN')
const report = { checks: [], consoleErrors: [], pageErrors: [], networkErrors: [], externalWarnings: [], screenshots: [], metrics: {} }
const check = (name, condition, evidence = null) => { report.checks.push({ name, passed: Boolean(condition), evidence }); assert.ok(condition, `${name}: ${JSON.stringify(evidence)}`) }
let browser
try {
  await waitForServer()
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  await context.addInitScript(() => localStorage.setItem('until-language', 'en'))
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => report.pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(origin)) report.networkErrors.push(`${response.status()} ${response.url()}`)
    else if (response.status() >= 400) report.externalWarnings.push(`${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => { if (request.url().startsWith(origin)) report.networkErrors.push(`${request.failure()?.errorText} ${request.url()}`); else report.externalWarnings.push(`${request.failure()?.errorText} ${request.url()}`) })
  await page.goto(origin, { waitUntil: 'networkidle' })

  // ── Hero ────────────────────────────────────────────────────────────────
  check('title and release-first hero render', (await page.title()).includes('UNTIL') && (await page.locator('h1').textContent()).includes('Your backlog reaches'))
  check('the top bar links to the four product sections', await page.locator('.nav a').count() === 4)
  check('both hero calls to action render', await page.locator('.hero-actions .button').count() === 2)
  check('the release meta states zero runtime dependencies', (await page.locator('.release-meta').textContent()).includes('0 runtime dependencies'))

  // ── The live engine console (it cycles through the three recorded steps) ──
  await page.waitForSelector('.console[data-step="0"]', { timeout: 20_000 })
  const failedPanel = await page.locator('.console-out pre').textContent()
  check('the first attempt shows the real failing assertion', failedPanel.includes('duplicate-entry') && failedPanel.includes('expected'), failedPanel.slice(-300))
  await page.waitForSelector('.console[data-step="1"]', { timeout: 20_000 })
  const passedPanel = await page.locator('.console-out pre').textContent()
  check('the second attempt shows the green project test', passedPanel.includes('ACTIVATION_TEST_OK'), passedPanel.slice(-300))
  await page.waitForSelector('.console[data-step="2"]', { timeout: 20_000 })
  const verdictPanel = await page.locator('.console-out pre').textContent()
  check('the verdict shows the audit chain and the release status', verdictPanel.includes('audit:') && verdictPanel.includes('release:'), verdictPanel.slice(-300))
  check('the console states both attempt outcomes', await page.locator('.console-step').count() === 2)
  const attemptStates = await page.locator('.console-step small').allTextContents()
  check('the attempt cards carry the recorded exit codes', attemptStates.join(' ').includes('exit 1') && attemptStates.join(' ').includes('exit 0'), attemptStates)

  // ── Published reports drive the numbers on the page ─────────────────────
  const [testReport, proofReport] = await Promise.all([
    page.evaluate(async () => (await fetch('tests.json')).json()),
    page.evaluate(async () => (await fetch('proof.json')).json()),
  ])
  const metricValues = await page.locator('.metric-card strong').allTextContents()
  check('the published test count is shown on the page', metricValues[0] === `${testReport.passed}/${testReport.tests}`, metricValues[0])
  check('the published proof count is shown on the page', metricValues[1] === `${proofReport.passed}/${proofReport.total}`, metricValues[1])
  check('four project numbers are listed', metricValues.length === 4)
  const repoStats = await page.locator('.repo-stats').textContent()
  check('the header badge carries the same published counts',
    repoStats.includes(`${testReport.passed}/${testReport.tests}`) && repoStats.includes(`${proofReport.passed}/${proofReport.total}`), repoStats)

  // ── Product-team value, roles, agent proof ───────────────────────────────
  check('three product-team value cards render', await page.locator('.feature-card').count() === 3)
  check('one value card is the featured one', await page.locator('.feature-card.is-featured').count() === 1)
  check('six roles own a decision', await page.locator('.role-block').count() === 6)
  const roleText = await page.locator('.role-grid').textContent()
  check('the role list says what stays with the human', roleText.includes('only a human has it') && roleText.includes('Integrations'))
  check('three agent trace cards render', await page.locator('.log-card').count() === 3)
  check('the failing test card is marked as a failure', await page.locator('.log-card.is-fail').count() === 1)
  const refusal = await page.locator('.log-card.is-ok pre').textContent()
  check('the real refusal is shown, not a success story', refusal.includes('attempts_exhausted') && refusal.includes('release: null'), refusal)
  const runFacts = await page.locator('.run-facts').textContent()
  // The facts on the page must match the run that is actually published, not a
  // model name hardcoded here: the published run changes with every sweep.
  const agentReport = await page.evaluate(async () => (await fetch('fixtures/agent-run.json')).json())
  check('the agent run facts name the published model and the audit state',
    runFacts.includes(agentReport.model)
    && runFacts.includes(agentReport.audit.valid ? 'valid' : 'broken')
    && runFacts.includes(`attempts ${agentReport.repair?.attempts ?? 0}`), { runFacts, model: agentReport.model })

  // ── Security ────────────────────────────────────────────────────────────
  check('six security claims render', await page.locator('.invert-list li').count() === 6)
  const perimeter = await page.locator('.invert-window pre').textContent()
  check('five exclusions are named', perimeter.split('\n').filter((line) => line.trim()).length === 5, perimeter)
  check('the access rules list the enforced policy fields', await page.locator('.invert-policy dl > div').count() === 5)
  const policyText = await page.locator('.invert-policy').textContent()
  check('the access rules name the paths and the autonomy boundary', policyText.includes('policy.build.allowedPaths') && policyText.includes('policy.autonomy'))
  check('CI security tooling is stated', (await page.locator('.invert-ci').textContent()).includes('CodeQL'))

  // ── Honest limits ───────────────────────────────────────────────────────
  check('four honest limits render', await page.locator('.faq-list details').count() === 4)
  const boundsText = await page.locator('.faq-list').textContent()
  check('the honest-limits section names the sandbox boundary', boundsText.includes('not a sandbox'))
  check('the honest-limits section refuses to promise ROI', boundsText.includes('ROI'))
  await page.locator('.faq-list details summary').first().click()
  check('a limit opens on click', await page.locator('.faq-list details').first().evaluate((node) => node.open))

  // ── Economics ───────────────────────────────────────────────────────────
  const economicsRows = await page.locator('.economics-row strong').allTextContents()
  check('four economics outputs render', economicsRows.length === 4)
  const accepted = Number(economicsRows[0].replace(/\s/g, '').replace(',', '.'))
  const costPerRelease = Number(economicsRows[1].replace(/[^\d]/g, ''))
  const waste = Number(economicsRows[2].replace(/[^\d]/g, ''))
  const total = Number(economicsRows[3].replace(/[^\d]/g, ''))
  check('the scenario computes numbers', Number.isFinite(accepted) && costPerRelease > 0 && total > 0, economicsRows)
  check('accepted releases, unit cost and rejected work reconcile with the monthly total',
    Math.abs(accepted * costPerRelease + waste - total) <= Math.max(total * 0.01, 100), { accepted, costPerRelease, waste, total })
  const costBefore = economicsRows[0]
  await page.locator('.economics-inputs input').first().fill('80')
  const costAfter = await page.locator('.economics-row strong').first().textContent()
  check('the economics recompute on changed assumptions', costBefore !== costAfter, { costBefore, costAfter })
  await page.locator('.economics-reset').click()
  check('the economics reset restores the scenario', (await page.locator('.economics-row strong').first().textContent()) === costBefore)

  // ── Contrast: text must be readable against its own background ──────────
  const contrast = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const read = (color) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = '#000'
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const data = context.getImageData(0, 0, 1, 1).data
      return [data[0], data[1], data[2], data[3] / 255]
    }
    const over = (top, bottom) => [
      top[0] * top[3] + bottom[0] * (1 - top[3]),
      top[1] * top[3] + bottom[1] * (1 - top[3]),
      top[2] * top[3] + bottom[2] * (1 - top[3]),
      1,
    ]
    const backgroundOf = (node) => {
      const stack = []
      let current = node
      while (current) { stack.push(getComputedStyle(current).backgroundColor); current = current.parentElement }
      let result = [255, 255, 255, 1]
      for (let index = stack.length - 1; index >= 0; index -= 1) result = over(read(stack[index]), result)
      return result
    }
    const luminance = ([r, g, b]) => {
      const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const results = {}
    for (const selector of ['.closing .button-secondary', '.closing .button-primary', '.hero .button-secondary', '.console-action', '.invert-policy dt', '.metric-card strong']) {
      const node = document.querySelector(selector)
      if (!node) { results[selector] = null; continue }
      const style = getComputedStyle(node)
      const background = backgroundOf(node)
      const foreground = over(read(style.color), background)
      const a = luminance(foreground)
      const b = luminance(background)
      results[selector] = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100
    }
    return results
  })
  for (const [selector, ratio] of Object.entries(contrast)) {
    check(`text contrast at ${selector} is readable`, ratio !== null && ratio >= 4.5, { selector, ratio })
  }

  // ── Links, anchors and localisation ─────────────────────────────────────
  const traceLinks = await page.locator('.console-action, .arrow-link').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')))
  check('both published traces are linked', traceLinks.includes('fixtures/repair-run.json') && traceLinks.includes('fixtures/agent-run.json'), traceLinks)
  const traceStatus = await page.evaluate(async () => {
    const results = {}
    for (const name of ['fixtures/repair-run.json', 'fixtures/agent-run.json']) {
      const response = await fetch(name)
      results[name] = response.status
    }
    return results
  })
  check('both published traces are reachable', Object.values(traceStatus).every((status) => status === 200), traceStatus)
  check('all in-page anchors resolve', await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].every((anchor) => document.getElementById(anchor.getAttribute('href').slice(1)))))
  for (const anchor of ['#value', '#agent', '#security', '#economics']) {
    await page.locator(`a[href="${anchor}"]`).first().click()
    check(`navigation ${anchor} works`, page.url().endsWith(anchor))
  }
  for (const [id, text] of [['ru', 'Ваш бэклог'], ['en', 'Your backlog']]) {
    await page.locator('.language button', { hasText: id.toUpperCase() }).first().click()
    check(`${id} localization renders`, (await page.locator('h1').textContent()).includes(text))
  }

  // ── Reveal on scroll ────────────────────────────────────────────────────
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(600)
  const revealed = await page.locator('.reveal.is-visible').count()
  check('sections reveal as they enter the viewport', revealed > 0, revealed)

  report.metrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource')
    return { requests: resources.length, encodedBytes: resources.reduce((sum, item) => sum + (item.encodedBodySize || 0), 0), domContentLoadedMs: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0, loadMs: performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0 }
  })
  check('initial page stays below 1.5 MB', report.metrics.encodedBytes < 1_500_000, report.metrics)
  await page.evaluate(() => window.scrollTo(0, 0))
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 })
    await page.waitForTimeout(250)
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    check(`no horizontal page overflow at ${width}px`, dimensions.scroll <= dimensions.viewport + 1, dimensions)
    const file = path.join(out, `until-${width}.jpg`)
    await page.screenshot({ path: file, type: 'jpeg', quality: 82, fullPage: true })
    report.screenshots.push(file)
  }
  await page.locator('.language button', { hasText: 'RU' }).first().click()
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 })
    await page.waitForTimeout(250)
    const russianDimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    check(`no horizontal overflow in Russian at ${width}px`, russianDimensions.scroll <= russianDimensions.viewport + 1, russianDimensions)
    const russianFile = path.join(out, `until-${width}-ru.jpg`)
    await page.screenshot({ path: russianFile, type: 'jpeg', quality: 82, fullPage: true })
    report.screenshots.push(russianFile)
  }
  check('zero browser console errors', report.consoleErrors.length === 0, report.consoleErrors)
  check('zero page runtime errors', report.pageErrors.length === 0, report.pageErrors)
  check('zero failed first-party requests', report.networkErrors.length === 0, report.networkErrors)
  await context.close()
} catch (error) { report.failure = error.stack; process.exitCode = 1 }
finally {
  if (browser) await browser.close()
  await stopServer()
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
