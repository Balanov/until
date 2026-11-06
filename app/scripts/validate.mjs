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
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
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
  check('title and owner-first product-work hero render', (await page.title()).includes('UNTIL') && (await page.locator('h1').textContent()).includes('Product work.'))
  await page.locator('.cycle-topline strong').getByText('6/6', { exact: true }).waitFor()
  check('six recorded product-cycle stages render', await page.locator('.cycle-step').count() === 6)
  check('all six role-separated tasks complete', await page.locator('.cycle-step-icon.is-done').count() === 6)
  const trustLine = await page.locator('.trust-line').textContent()
  check('52 tests and 14 deterministic proof checks are visible', trustLine.includes('52/52') && trustLine.includes('14/14'), trustLine)
  const codeProof = await page.locator('.code-proof').textContent()
  check('real repository test shows fail-to-pass transition', codeProof.includes('FAIL · exit 1') && codeProof.includes('ACTIVATION_TEST_OK · exit 0'))
  check('two immutable release files and six acceptance checks are visible', (await page.locator('.proof-stat-grid').textContent()).includes('6/6') && (await page.locator('.proof-stat-grid').textContent()).includes('2'))
  const repositoryDownload = page.waitForEvent('download')
  await page.locator('.proof-download').click()
  check('raw repository cycle downloads', (await repositoryDownload).suggestedFilename() === 'repository-run.json')
  await page.locator('.benchmark-details > summary').click()
  await page.locator('.acceptance-score strong').getByText('6/6', { exact: true }).waitFor()
  check('same-model benchmark and three score bars render', await page.locator('.score-row').count() === 3)
  check('six independently accepted raw trials are selectable', await page.locator('#trial-select option').count() === 6)
  await page.locator('#trial-select').selectOption('4')
  await page.locator('.run-readout strong').getByText('preview-import-errors', { exact: true }).waitFor()
  check('trial switch loads a different actual engine trace', (await page.locator('.run-readout').textContent()).includes('audit events'))
  const traceDownload = page.waitForEvent('download')
  await page.locator('.trace-actions a').first().click()
  check('raw engine trace downloads', (await traceDownload).suggestedFilename() === 'result.json')
  const bundleDownload = page.waitForEvent('download')
  await page.locator('.data-links a').last().click()
  check('complete raw proof bundle downloads', (await bundleDownload).suggestedFilename() === 'until-proof.zip')
  check('direct baseline advantage remains visible', (await page.locator('.benchmark-facts').textContent()).includes('3.3×'))
  check('comparison includes five sourced products', await page.locator('.comparison-table thead th').count() === 6)
  check('comparison includes eight capabilities', await page.locator('.comparison-table tbody tr').count() === 8)
  check('Git delivery and local-candidate boundaries are visible', (await page.locator('.comparison-notes').textContent()).includes('Git/PR') && (await page.locator('.comparison-notes').textContent()).includes('local release candidates'))
  for (const [index, anchor] of ['#how', '#results', '#compare', '#economics'].entries()) {
    await page.locator('.main-nav a').nth(index).click()
    check(`navigation ${anchor} works`, page.url().endsWith(anchor))
  }
  check('initial calculator scenario is computed', (await page.locator('.scenario-delta strong').textContent()).includes('13,700'))
  await page.locator('.calc-input input').first().fill('20')
  check('calculator recomputes changed assumptions', (await page.locator('.scenario-delta strong').textContent()).includes('4,100'))
  check('acceptance rate controls required attempts', (await page.locator('.attempt-readout strong').textContent()) === '10.0')
  await page.locator('.currency-field select').selectOption('RUB')
  check('currency selection changes output', (await page.locator('.scenario-delta strong').textContent()).includes('RUB'))
  await page.locator('.reset-button').click()
  check('calculator reset restores initial scenario', (await page.locator('.scenario-delta strong').textContent()).includes('13,700'))
  await page.locator('.quick-copy button').click()
  await page.getByText('Copied', { exact: true }).waitFor()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  check('quick start copies real commands', clipboard.includes('npm run check') && clipboard.includes('npm run proof'))
  for (const [id, text] of [['ru', 'Продуктовая работа.'], ['zh', '产品工作。'], ['hi', 'प्रोडक्ट'], ['es', 'Trabajo de producto'], ['ar', 'عمل المنتج']]) {
    await page.locator('.language-picker select').selectOption(id)
    check(`${id} localization renders`, (await page.locator('h1').textContent()).includes(text))
    if (id === 'ar') check('Arabic uses RTL', await page.locator('html').getAttribute('dir') === 'rtl')
  }
  await page.locator('.language-picker select').selectOption('en')
  check('live GitHub star counter links to stargazers', await page.locator('.repo-counter').getAttribute('href') === 'https://github.com/Balanov/until/stargazers')
  check('all in-page anchors resolve', await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].every((anchor) => document.getElementById(anchor.getAttribute('href').slice(1)))))
  report.metrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource')
    return { requests: resources.length, encodedBytes: resources.reduce((sum, item) => sum + (item.encodedBodySize || 0), 0), domContentLoadedMs: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0, loadMs: performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0 }
  })
  check('initial page stays below 1.5 MB', report.metrics.encodedBytes < 1_500_000, report.metrics)
  await page.locator('.benchmark-details > summary').click()
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
  await page.locator('.language-picker select').selectOption('ar')
  const rtlDimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  check('no horizontal overflow in mobile RTL', rtlDimensions.scroll <= rtlDimensions.viewport + 1, rtlDimensions)
  const rtlFile = path.join(out, 'until-375-ar.jpg')
  await page.screenshot({ path: rtlFile, type: 'jpeg', quality: 82, fullPage: true })
  report.screenshots.push(rtlFile)
  await page.locator('.language-picker select').selectOption('ru')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.waitForTimeout(250)
  const russianDesktopDimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  check('no horizontal overflow in desktop Russian', russianDesktopDimensions.scroll <= russianDesktopDimensions.viewport + 1, russianDesktopDimensions)
  const russianDesktopFile = path.join(out, 'until-1440-ru.jpg')
  await page.screenshot({ path: russianDesktopFile, type: 'jpeg', quality: 82, fullPage: true })
  report.screenshots.push(russianDesktopFile)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.waitForTimeout(250)
  const russianDimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  check('no horizontal overflow in mobile Russian', russianDimensions.scroll <= russianDimensions.viewport + 1, russianDimensions)
  const russianFile = path.join(out, 'until-375-ru.jpg')
  await page.screenshot({ path: russianFile, type: 'jpeg', quality: 82, fullPage: true })
  report.screenshots.push(russianFile)
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
