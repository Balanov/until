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
const port = 7100
const origin = externalOrigin || `http://127.0.0.1:${port}`
const server = externalOrigin ? null : spawn(actualNodeBinary(), [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: root,
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
if (server) {
  server.stdout.on('data', (chunk) => { serverOutput += chunk })
  server.stderr.on('data', (chunk) => { serverOutput += chunk })
}

async function stopServer() {
  if (!server || server.killed) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: false })
      killer.on('close', resolve)
      killer.on('error', resolve)
    })
  } else {
    server.kill('SIGTERM')
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview did not start: ${serverOutput}`)
}

const executablePath = process.env.CHROME_BIN || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => existsSync(candidate))
if (!executablePath) throw new Error('No Chrome/Edge executable found; set CHROME_BIN')

const report = { checks: [], consoleErrors: [], pageErrors: [], networkErrors: [], screenshots: [], metrics: {} }
const check = (name, condition, evidence = null) => {
  report.checks.push({ name, passed: Boolean(condition), evidence })
  assert.ok(condition, `${name}: ${JSON.stringify(evidence)}`)
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  await context.addInitScript(() => localStorage.setItem('until-language', 'en'))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  const page = await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => report.pageErrors.push(error.message))
  page.on('response', (response) => { if (response.status() >= 400) report.networkErrors.push(`${response.status()} ${response.url()}`) })
  page.on('requestfailed', (request) => report.networkErrors.push(`${request.failure()?.errorText} ${request.url()}`))

  await page.goto(origin, { waitUntil: 'networkidle' })
  check('production title and hero render', (await page.title()).includes('UNTIL') && await page.locator('h1').isVisible())
  check('seven proof stages render', await page.locator('.rail-stage').count() === 7)
  report.metrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource')
    return {
      requests: resources.length,
      encodedBytes: resources.reduce((sum, item) => sum + (item.encodedBodySize || 0), 0),
      domContentLoadedMs: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
      loadMs: performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0,
    }
  })

  await page.locator('.console-actions .button-dark').click()
  await page.getByText('Observed outcome achieved', { exact: true }).waitFor({ timeout: 12_000 })
  check('real-signal replay reaches observed outcome', await page.locator('.rail-stage.done').count() === 7)

  await page.locator('.scenario-switch button').nth(1).click()
  await page.locator('.console-actions .button-dark').click()
  await page.getByText('Delivery blocked by policy', { exact: true }).waitFor({ timeout: 12_000 })
  check('synthetic replay stops before contract', await page.locator('.rail-stage.blocked').count() === 1)
  check('synthetic stages after research are skipped', await page.locator('.rail-stage.skipped').count() === 4)

  const downloadPromise = page.waitForEvent('download')
  await page.locator('.metric').first().click()
  const download = await downloadPromise
  check('raw test report downloads', download.suggestedFilename() === 'tests.json')

  await page.locator('select').selectOption('ru')
  check('Russian localization applies', (await page.locator('h1').textContent()).includes('доказано'))
  await page.locator('select').selectOption('zh')
  check('Chinese localization applies', (await page.locator('h1').textContent()).includes('证明'))
  await page.locator('select').selectOption('hi')
  check('Hindi localization applies', (await page.locator('h1').textContent()).includes('सिद्ध'))
  await page.locator('select').selectOption('es')
  check('Spanish localization applies', (await page.locator('h1').textContent()).includes('probado'))
  await page.locator('select').selectOption('ar')
  check('Arabic applies RTL', await page.locator('html').getAttribute('dir') === 'rtl')
  await page.locator('select').selectOption('en')

  await page.locator('.quick-copy button').click()
  await page.getByText('Copied', { exact: true }).waitFor()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  check('quick-start copy writes actual commands', clipboard.includes('npm test') && clipboard.includes('npm run proof'))
  await page.locator('.faq-list details').nth(1).locator('summary').click()
  check('FAQ opens on click', await page.locator('.faq-list details').nth(1).getAttribute('open') !== null)
  await page.locator('.main-nav a').first().click()
  check('proof navigation updates the anchor', page.url().endsWith('#proof'))

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('.scenario-switch button').nth(0).click()
  await page.locator('.console-actions .button-dark').click()
  await page.getByText('Observed outcome achieved', { exact: true }).waitFor({ timeout: 12_000 })
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 })
    await page.waitForTimeout(250)
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    check(`no horizontal page overflow at ${width}px`, dimensions.scroll <= dimensions.viewport + 1, dimensions)
    const file = path.join(out, `until-${width}.jpg`)
    await page.screenshot({ path: file, type: 'jpeg', quality: 82, fullPage: true })
    report.screenshots.push(file)
  }
  await page.locator('.scenario-switch button').nth(1).click()
  await page.locator('.console-actions .button-dark').click()
  await page.getByText('Delivery blocked by policy', { exact: true }).waitFor({ timeout: 12_000 })
  report.focusBeforeBlocked = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    className: document.activeElement?.className,
    text: document.activeElement?.textContent,
    focusVisible: document.activeElement?.matches(':focus-visible'),
  }))
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  const blockedFile = path.join(out, 'until-375-blocked.jpg')
  await page.screenshot({ path: blockedFile, type: 'jpeg', quality: 82, fullPage: true })
  report.screenshots.push(blockedFile)
  await page.locator('select').selectOption('ar')
  const rtlDimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
  check('no horizontal overflow in mobile RTL', rtlDimensions.scroll <= rtlDimensions.viewport + 1, rtlDimensions)
  const rtlFile = path.join(out, 'until-375-ar.jpg')
  await page.screenshot({ path: rtlFile, type: 'jpeg', quality: 82, fullPage: true })
  report.screenshots.push(rtlFile)

  check('zero browser console errors', report.consoleErrors.length === 0, report.consoleErrors)
  check('zero page runtime errors', report.pageErrors.length === 0, report.pageErrors)
  check('zero failed or 404 network requests', report.networkErrors.length === 0, report.networkErrors)
  await context.close()
} catch (error) {
  report.failure = error.stack
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  await stopServer()
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}
