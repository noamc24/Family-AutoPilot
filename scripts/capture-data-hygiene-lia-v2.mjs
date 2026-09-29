import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const base = 'http://127.0.0.1:5180'
const output = path.resolve('screenshots/data-hygiene-lia-v2')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })

async function open(viewport) {
  const context = await browser.newContext({ viewport, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await context.addInitScript(() => localStorage.setItem('family-autopilot-person', 'Mor'))
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fampilot:showcase-reset')))
  await page.waitForTimeout(150)
  return { context, page }
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: path.join(output, name), fullPage: false })
}

async function nav(page, label) {
  const choices = page.locator(`.nav-item[aria-label="${label}"], .mobile-nav button:has-text("${label}")`)
  for (let index = 0; index < await choices.count(); index += 1) {
    if (await choices.nth(index).isVisible()) { await choices.nth(index).click(); return }
  }
  throw new Error(`Missing navigation: ${label}`)
}

async function send(page, text) {
  const input = page.getByRole('textbox', { name: 'שאלו את LIA' })
  await input.fill(text)
  await input.press('Enter')
  await page.waitForTimeout(100)
}

for (const [viewport, prefix] of [[{ width: 1440, height: 1000 }, 'desktop'], [{ width: 390, height: 844 }, 'mobile']]) {
  const { context, page } = await open(viewport)
  await shot(page, `${prefix}-home-before-cleanup.png`)
  await page.evaluate(() => {
    const key = 'family-autopilot-he-v1'
    const data = JSON.parse(localStorage.getItem(key) || '{}')
    const expired = { id: 'qa-expired', familyId: 'Avrahami', title: 'אירוע ישן שלא אמור להופיע', date: '2020-01-01', time: '08:00', endTime: '09:00', peopleIds: ['Mor'], icon: '🧹', responsibleId: 'Mor' }
    data.events.push(expired)
    data.tasks.push({ id: 'qa-expired-task', familyId: 'Avrahami', title: 'תלות ישנה', due: '2020-01-01', done: false, ownerId: 'Mor', eventId: expired.id })
    data.activity.push({ id: 'qa-expired-activity', familyId: 'Avrahami', text: 'פעילות ישנה', createdAt: new Date().toISOString(), eventId: expired.id })
    localStorage.setItem(key, JSON.stringify(data))
  })
  await page.reload({ waitUntil: 'networkidle' })
  const cleaned = await page.evaluate(() => JSON.parse(localStorage.getItem('family-autopilot-he-v1') || '{}'))
  assert.equal(cleaned.events.some(item => item.id === 'qa-expired'), false)
  assert.equal(cleaned.tasks.some(item => item.id === 'qa-expired-task'), false)
  assert.equal(cleaned.activity.some(item => item.id === 'qa-expired-activity'), false)
  assert.equal((await page.locator('body').innerText()).includes('אירוע ישן שלא אמור להופיע'), false)
  await shot(page, `${prefix}-home-after-cleanup.png`)

  await page.evaluate(() => {
    const key = 'family-autopilot-he-v1'
    const data = JSON.parse(localStorage.getItem(key) || '{}')
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
    data.events.push({ id: 'qa-open-ride', familyId: 'Avrahami', title: 'חוג של איתמר', date, time: '20:00', participantIds: ['Itamar'], icon: '🚗', responsibleId: '', requiresDriver: true, createdById: 'Mor' })
    localStorage.setItem(key, JSON.stringify(data))
  })
  await page.reload({ waitUntil: 'networkidle' })

  await nav(page, 'LIA')
  await send(page, 'מי יכול לקחת את איתמר לחוג?')
  await page.locator('.lia-chat-action-card').waitFor()
  await send(page, 'ומה עם מור?')
  await page.locator('.lia-chat-action-card').last().waitFor()
  await shot(page, `${prefix}-lia-context-follow-up.png`)
  await send(page, 'אז תשלחי לה')
  const acted = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('family-autopilot-he-v1') || '{}')
    const conversation = data.liaConversations?.find(item => item.memberId === 'Mor')
    const sent = conversation?.messages?.at(-1)?.text?.includes('שלחתי ל־מור')
    const requested = data.transportationRequests?.some(request => Object.hasOwn(request.responses || {}, 'Mor') || request.selectedDriverId === 'Mor')
    return { sent, requested, last: conversation?.messages?.at(-1)?.text, requests: data.transportationRequests }
  })
  assert.equal(acted.sent && acted.requested, true, JSON.stringify(acted))
  await shot(page, `${prefix}-lia-action-complete.png`)
  const messageCount = await page.locator('.lia-chat-message').count()
  await page.reload({ waitUntil: 'networkidle' })
  await nav(page, 'LIA')
  assert.equal(await page.locator('.lia-chat-message').count(), messageCount)
  await context.close()
}

await browser.close()
console.log(`Captured data hygiene and LIA V2 QA in ${output}`)
