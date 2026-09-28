import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const output = path.resolve('screenshots/tasks-family-final-polish')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const base = 'http://127.0.0.1:5180'

async function open(viewport, person = 'Orel') {
  const context = await browser.newContext({ viewport, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  const page = await context.newPage()
  await page.addInitScript(id => localStorage.setItem('family-autopilot-person', id), person)
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.locator('.view-home').waitFor()
  return { context, page }
}
async function nav(page, label) {
  const targets = page.locator(`.nav-item[aria-label="${label}"], .mobile-nav button:has-text("${label}")`)
  for (let i = 0; i < await targets.count(); i++) if (await targets.nth(i).isVisible()) { await targets.nth(i).click(); break }
  await page.waitForTimeout(250)
}
async function shot(page, name) { await page.screenshot({ path: path.join(output, name), fullPage: false }) }

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const mobile = viewport.width === 390
  const { context, page } = await open(viewport)
  await nav(page, 'משימות')
  await page.getByRole('button', { name: 'הכל', exact: true }).click()
  await shot(page, `${mobile ? 'mobile' : 'desktop'}-tasks-${viewport.width}x${viewport.height}.png`)
  await page.locator('.task-v2-row .task-copy').first().click()
  await page.locator('.task-detail').waitFor()
  await shot(page, `${mobile ? 'mobile' : 'desktop'}-task-details-${viewport.width}x${viewport.height}.png`)
  await page.getByRole('button', { name: /סימון כהושלם/ }).click()
  await page.getByRole('button', { name: 'סגירה' }).click()
  if (!mobile) await shot(page, `desktop-tasks-completed-${viewport.width}x${viewport.height}.png`)
  await nav(page, 'משפחה')
  await shot(page, `${mobile ? 'mobile' : 'desktop'}-family-${viewport.width}x${viewport.height}.png`)
  await page.locator('.person-row').first().click()
  await page.locator('.member-profile').waitFor()
  await shot(page, `${mobile ? 'mobile' : 'desktop'}-member-profile-${viewport.width}x${viewport.height}.png`)
  if (!mobile) {
    await page.getByRole('button', { name: 'עריכה', exact: true }).click()
    await page.getByRole('heading', { name: 'עריכת בן משפחה' }).waitFor()
    await shot(page, `desktop-member-edit-${viewport.width}x${viewport.height}.png`)
  }
  await context.close()
}

{
  const { context, page } = await open({ width: 1440, height: 1000 }, 'Itamar')
  await nav(page, 'משפחה')
  await shot(page, 'desktop-child-family-1440x1000.png')
  await context.close()
}

await browser.close()
console.log(`Captured Tasks + Family screenshots in ${output}`)
