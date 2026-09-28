import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const output = path.resolve('screenshots/submission-functional-pass')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const base = 'http://127.0.0.1:5180'

async function settle(page) {
  await page.waitForTimeout(250)
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1200))]))
}

async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await settle(page)
  await page.screenshot({ path: path.join(output, name), fullPage: false })
}

async function open(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.locator('.view-home').waitFor()
  return { context, page }
}

async function nav(page, label) {
  const targets = page.locator(`.nav-item[aria-label="${label}"], .mobile-nav button:has-text("${label}")`)
  for (let index = 0; index < await targets.count(); index += 1) {
    if (await targets.nth(index).isVisible()) { await targets.nth(index).click(); break }
  }
  await settle(page)
}

async function resetAndTrigger(page) {
  if ((await page.viewportSize()).width <= 768) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('fampilot:showcase-reset')))
    await page.waitForTimeout(300)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('fampilot:showcase-trigger', { detail: { kind: 'whatsapp-calendar' } })))
  } else {
    await nav(page, 'עוד')
    await page.getByRole('button', { name: /איפוס Showcase/ }).click()
    await page.waitForTimeout(300)
    await page.locator('.showcase-scenarios > div').filter({ hasText: 'WhatsApp' }).getByRole('button').click()
  }
  await page.locator('.view-home').waitFor()
  return page.locator('.lia-card').filter({ hasText: 'שינוי באירוע' }).first()
}

async function approve(page) {
  const card = await resetAndTrigger(page)
  await card.getByRole('button', { name: 'אישור ועדכון' }).click()
  await page.getByText(/LIA עדכנה את האירוע/).waitFor()
}

async function openLiaEventDetails(page) {
  await nav(page, 'יומן')
  const event = page.locator('.month-event').filter({ hasText: 'אימון כדורגל' }).first()
  await event.click()
  await page.locator('.calendar-detail').waitFor()
}

// Capture pristine reset state first, before this harness triggers any scenario.
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const mobile = viewport.width === 390
  const { context, page } = await open(viewport)
  if (mobile) await page.evaluate(() => window.dispatchEvent(new CustomEvent('fampilot:showcase-reset')))
  else {
    await nav(page, 'עוד')
    await page.getByRole('button', { name: /איפוס Showcase/ }).click()
    await nav(page, 'בית')
  }
  await page.locator('.view-home').waitFor()
  await page.locator('.toast').waitFor({ state: 'detached' })
  await shot(page, `${mobile ? 'mobile' : 'desktop'}-clean-home-${viewport.width}x${viewport.height}.png`)
  if (!mobile) {
    await nav(page, 'יומן')
    await shot(page, `desktop-clean-calendar-${viewport.width}x${viewport.height}.png`)
  }
  await context.close()
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const mobile = viewport.width === 390
  {
    const { context, page } = await open(viewport)
    const card = await resetAndTrigger(page)
    await card.getByRole('button', { name: 'אישור ועדכון' }).waitFor()
    await card.getByRole('button', { name: 'דחייה' }).waitFor()
    await shot(page, `${mobile ? 'mobile' : 'desktop'}-approve-reject-${viewport.width}x${viewport.height}.png`)
    if (!mobile) {
      await card.getByRole('button', { name: 'דחייה' }).click()
      await page.getByText('העדכון נדחה ולא בוצע שינוי.').waitFor()
      await shot(page, `desktop-after-rejection-${viewport.width}x${viewport.height}.png`)
    }
    await context.close()
  }
  {
    const { context, page } = await open(viewport)
    await approve(page)
    if (!mobile) await shot(page, `desktop-after-approval-${viewport.width}x${viewport.height}.png`)
    await openLiaEventDetails(page)
    await shot(page, `${mobile ? 'mobile' : 'desktop'}-lia-event-details-${viewport.width}x${viewport.height}.png`)
    if (!mobile) {
      await page.getByRole('button', { name: 'עריכה' }).click()
      await page.getByRole('heading', { name: 'עריכת אירוע' }).waitFor()
      await shot(page, `desktop-edit-event-${viewport.width}x${viewport.height}.png`)
      await page.getByRole('button', { name: 'מחיקה' }).click()
      await page.getByRole('heading', { name: 'אישור פעולה' }).waitFor()
      await shot(page, `desktop-delete-confirmation-${viewport.width}x${viewport.height}.png`)
    }
    await context.close()
  }
}

await browser.close()
console.log(`Captured Submission Functional screenshots in ${output}`)
