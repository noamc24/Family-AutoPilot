import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const baseUrl = 'http://127.0.0.1:5173'
const output = path.resolve('screenshots/lia-chat-luxury-pass')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(180)
}

async function openChat(page) {
  await page.goto(baseUrl)
  const options = page.locator('.nav-item[aria-label="LIA"], .mobile-nav button:has-text("LIA")')
  for (let index = 0; index < await options.count(); index += 1) if (await options.nth(index).isVisible()) { await options.nth(index).click(); break }
  await page.locator('.lia-chat-shell').waitFor()
}

async function send(page, text) {
  const input = page.getByRole('textbox', { name: 'שאלו את LIA' })
  await input.fill(text)
  await input.press('Enter')
  await page.waitForTimeout(120)
}

async function shot(page, name) {
  await settle(page)
  await page.screenshot({ path: path.join(output, name), fullPage: false })
}

async function pageFor(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await openChat(page)
  return { context, page }
}

{
  const { context, page } = await pageFor({ width: 1440, height: 1000 })
  await shot(page, 'desktop-empty-1440x1000.png')
  await send(page, 'מה יש לי היום?')
  await send(page, 'איזה משימות פתוחות יש לי?')
  await send(page, 'מה השתנה היום?')
  await send(page, 'מה כבר טופל?')
  await shot(page, 'desktop-conversation-8-messages-1440x1000.png')
  await context.close()
}

{
  const { context, page } = await pageFor({ width: 1440, height: 1000 })
  await send(page, 'מי יכול לקחת את איתמר לחוג?')
  await page.locator('.lia-chat-action-card').waitFor()
  await shot(page, 'desktop-action-suggestion-1440x1000.png')
  await page.locator('.lia-chat-action-card > button').click()
  await shot(page, 'desktop-pending-state-1440x1000.png')
  await page.evaluate(() => {
    const key = 'family-autopilot-he-v1'
    const data = JSON.parse(localStorage.getItem(key) || '{}')
    const conversation = data.liaConversations?.find(item => item.memberId === localStorage.getItem('family-autopilot-person')) || data.liaConversations?.[0]
    const eventId = conversation?.contextState?.lastEventId
    const memberId = conversation?.contextState?.lastMemberId
    const request = data.transportationRequests?.find(item => item.eventId === eventId)
    const event = data.events?.find(item => item.id === eventId)
    if (request && memberId) { request.selectedDriverId = memberId; request.status = 'COVERED'; request.responses = { ...request.responses, [memberId]: 'CAN_DO' } }
    if (event && memberId) event.responsibleId = memberId
    localStorage.setItem(key, JSON.stringify(data))
  })
  await openChat(page)
  await send(page, 'מה קרה עם ההסעה?')
  await shot(page, 'desktop-resolved-state-1440x1000.png')
  await context.close()
}

{
  const { context, page } = await pageFor({ width: 390, height: 844 })
  await shot(page, 'mobile-empty-390x844.png')
  await send(page, 'מה דורש טיפול היום?')
  await send(page, 'מה יש לי היום?')
  await shot(page, 'mobile-active-conversation-390x844.png')
  await context.close()
}

{
  const { context, page } = await pageFor({ width: 390, height: 844 })
  await send(page, 'מי יכול לקחת את איתמר לחוג?')
  await page.locator('.lia-chat-action-card').waitFor()
  await shot(page, 'mobile-action-card-390x844.png')
  const input = page.getByRole('textbox', { name: 'שאלו את LIA' })
  await input.fill('אפשר לבדוק גם מי פנוי אחרי 17:00?')
  await shot(page, 'mobile-composer-390x844.png')
  await context.close()
}

await browser.close()
console.log(`Captured focused LIA Chat screenshots in ${output}`)
