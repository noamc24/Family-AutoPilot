import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const output = path.resolve('screenshots/global-identity-pass')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(220)
}

async function resetScroll(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelectorAll('*').forEach(element => { if (element.scrollTop > 0) element.scrollTop = 0 })
  })
}

async function shot(page, name) {
  await resetScroll(page)
  await settle(page)
  await page.screenshot({ path: path.join(output, name), fullPage: false })
}

async function navigate(page, name) {
  const candidates = page.locator(`.nav-item[aria-label="${name}"], .mobile-nav button:has-text("${name}")`)
  for (let index = 0; index < await candidates.count(); index += 1) {
    if (await candidates.nth(index).isVisible()) { await candidates.nth(index).click(); break }
  }
  await page.waitForTimeout(180)
}

async function openSettings(page) {
  await page.locator('.profile-button').evaluate(element => element.click())
  await page.locator('.menu-settings').waitFor({ state: 'attached', timeout: 3000 })
  await page.locator('.menu-settings').evaluate(element => element.click())
  await page.locator('.settings-page').waitFor({ timeout: 3000 })
}

async function open(viewport, calm = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  if (calm) await context.addInitScript(() => {
    const person = { id: 'parent', name: 'נועה', role: 'אם', color: 'sage', age: 38, hasLicense: true, hasCar: true, availableForPickup: true, routines: [] }
    localStorage.setItem('family-autopilot-he-v1', JSON.stringify({ families: [{ id: 'quiet', name: 'משפחת שלו', people: [person] }], events: [], tasks: [], activity: [], transportationRequests: [], integrationLogs: [], calendarMirrors: [], acknowledgements: [], suppressedRoutineTaskIds: [], pendingActions: [], dismissedActionIds: [] }))
    localStorage.setItem('family-autopilot-family', 'quiet')
    localStorage.setItem('family-autopilot-person', 'parent')
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5173')
  await settle(page)
  return { context, page }
}

{
  const { context, page } = await open({ width: 1440, height: 1000 }, true)
  await shot(page, 'desktop-home-calm-1440x1000.png')
  await context.close()
}

{
  const { context, page } = await open({ width: 1440, height: 1000 })
  await shot(page, 'desktop-home-active-1440x1000.png')
  await shot(page, 'desktop-sidebar-collapsed-1440x1000.png')
  await page.locator('.sidebar').hover()
  await page.waitForTimeout(260)
  await shot(page, 'desktop-sidebar-expanded-1440x1000.png')
  await page.mouse.move(700, 500)
  await navigate(page, 'יומן')
  await shot(page, 'desktop-calendar-monthly-1440x1000.png')
  await page.getByRole('button', { name: 'שבועי', exact: true }).click()
  await shot(page, 'desktop-calendar-weekly-1440x1000.png')
  await navigate(page, 'משימות')
  await shot(page, 'desktop-tasks-1440x1000.png')
  await navigate(page, 'משפחה')
  await shot(page, 'desktop-family-1440x1000.png')
  await navigate(page, 'LIA')
  const input = page.getByRole('textbox', { name: 'שאלו את LIA' })
  await input.fill('מה דורש טיפול היום?')
  await input.press('Enter')
  await shot(page, 'desktop-lia-chat-active-1440x1000.png')
  await openSettings(page)
  await shot(page, 'desktop-settings-1440x1000.png')
  await context.close()
}

{
  const { context, page } = await open({ width: 390, height: 844 })
  await shot(page, 'mobile-home-390x844.png')
  await navigate(page, 'יומן')
  await shot(page, 'mobile-calendar-390x844.png')
  await navigate(page, 'LIA')
  const input = page.getByRole('textbox', { name: 'שאלו את LIA' })
  await input.fill('מה יש לי היום?')
  await input.press('Enter')
  await shot(page, 'mobile-lia-chat-390x844.png')
  await openSettings(page)
  await shot(page, 'mobile-settings-390x844.png')
  await context.close()
}

await browser.close()
console.log(`Captured Global Identity screenshots in ${output}`)
