import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const baseUrl = 'http://127.0.0.1:5173'
const output = path.resolve('screenshots/luxury-visual-pass')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
}

async function shot(page, name) {
  await settle(page)
  await page.screenshot({ path: path.join(output, name), fullPage: false })
}

async function openView(page, label) {
  const options = page.locator(`.nav-item[aria-label="${label}"], .mobile-nav button:has-text("${label}")`)
  for (let index = 0; index < await options.count(); index += 1) {
    if (await options.nth(index).isVisible()) { await options.nth(index).click(); return }
  }
  throw new Error(`No visible navigation item for ${label}`)
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const page = await desktop.newPage()
await page.goto(baseUrl)
await shot(page, 'desktop-home-active-1440x1000.png')

await page.evaluate(() => {
  const family = { id: 'quiet', name: 'משפחה שקטה', people: [{ id: 'parent', name: 'נועם', role: 'אב', color: 'sage', age: 35, hasLicense: true, hasCar: true, availableForPickup: true }] }
  const data = { families: [family], events: [], tasks: [], activity: [], transportationRequests: [], integrationLogs: [], calendarMirrors: [], acknowledgements: [], pendingActions: [], dismissedActionIds: [], trafficSignals: [], externalSignals: [], liaInterventions: [], liaConversations: [] }
  localStorage.setItem('family-autopilot-he-v1', JSON.stringify(data))
  localStorage.setItem('family-autopilot-family', 'quiet')
  localStorage.setItem('family-autopilot-person', 'parent')
})
await page.reload()
await shot(page, 'desktop-home-calm-1440x1000.png')

await page.evaluate(() => localStorage.clear())
await page.reload()
await openView(page, 'יומן')
await shot(page, 'desktop-calendar-month-1440x1000.png')
await page.getByRole('button', { name: 'אנשים', exact: true }).click()
await shot(page, 'desktop-calendar-people-table-1440x1000.png')

await openView(page, 'משימות')
await shot(page, 'desktop-tasks-1440x1000.png')
await openView(page, 'משפחה')
await shot(page, 'desktop-family-1440x1000.png')
await openView(page, 'LIA')
await shot(page, 'desktop-lia-chat-1440x1000.png')

await page.locator('.profile-button').click()
await page.locator('.menu-settings').click()
await shot(page, 'desktop-settings-1440x1000.png')
await page.locator('.settings-tile').filter({ hasText: 'חיבורים' }).click()
await shot(page, 'desktop-connections-1440x1000.png')
await desktop.close()

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const phone = await mobile.newPage()
await phone.goto(baseUrl)
await shot(phone, 'mobile-home-390x844.png')
await openView(phone, 'יומן')
await shot(phone, 'mobile-calendar-390x844.png')
await openView(phone, 'LIA')
await shot(phone, 'mobile-lia-chat-390x844.png')
await phone.locator('.profile-button').click()
await phone.locator('.menu-settings').click()
await shot(phone, 'mobile-settings-390x844.png')
await mobile.close()
await browser.close()

console.log(`Captured screenshots in ${output}`)
