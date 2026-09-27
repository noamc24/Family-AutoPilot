import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const output = path.resolve('screenshots/calendar-luxury-pass')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(180)
}

async function openCalendar(page) {
  await page.goto('http://127.0.0.1:5173')
  const links = page.locator('.nav-item[aria-label="יומן"], .mobile-nav button:has-text("יומן")')
  for (let index = 0; index < await links.count(); index += 1) {
    if (await links.nth(index).isVisible()) { await links.nth(index).click(); break }
  }
  await page.locator('.calendar-v2').waitFor()
  await settle(page)
}

async function clickControl(page, name) {
  const buttons = page.getByRole('button', { name, exact: true })
  for (let index = 0; index < await buttons.count(); index += 1) {
    if (await buttons.nth(index).isVisible()) { await buttons.nth(index).click(); break }
  }
  await page.waitForTimeout(140)
}

async function shot(page, name) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.querySelectorAll('*').forEach(element => { if (element.scrollTop > 0) element.scrollTop = 0 })
  })
  await settle(page)
  await page.screenshot({ path: path.join(output, name), fullPage: false })
}

async function create(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await openCalendar(page)
  return { context, page }
}

{
  const { context, page } = await create({ width: 1440, height: 1000 })
  await shot(page, 'desktop-monthly-1440x1000.png')
  const busyDay = page.locator('.month-day:has(.month-event)').first()
  await busyDay.hover()
  await page.waitForTimeout(180)
  await shot(page, 'desktop-month-popover-1440x1000.png')
  await clickControl(page, 'שבועי')
  await shot(page, 'desktop-weekly-1440x1000.png')
  await clickControl(page, 'יומי')
  await shot(page, 'desktop-daily-1440x1000.png')
  await clickControl(page, 'שנתי')
  await shot(page, 'desktop-yearly-1440x1000.png')
  await clickControl(page, 'חודשי')
  await clickControl(page, 'אנשים')
  const selected = page.locator('.people-filter button.selected')
  while (await selected.count() > 3) await selected.last().click()
  await shot(page, 'desktop-people-table-3-members-1440x1000.png')
  await clickControl(page, 'שורות')
  await shot(page, 'desktop-people-rows-1440x1000.png')
  await context.close()
}

{
  const { context, page } = await create({ width: 390, height: 844 })
  await shot(page, 'mobile-monthly-390x844.png')
  await clickControl(page, 'יומי')
  await shot(page, 'mobile-daily-390x844.png')
  await clickControl(page, 'שבועי')
  await shot(page, 'mobile-weekly-390x844.png')
  await clickControl(page, 'אנשים')
  await shot(page, 'mobile-people-390x844.png')
  await context.close()
}

await browser.close()
console.log(`Captured Calendar screenshots in ${output}`)
