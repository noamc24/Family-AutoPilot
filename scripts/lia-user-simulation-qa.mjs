import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const output = path.resolve('screenshots/lia-user-simulation')
await mkdir(output, { recursive: true })

const scenarios = [
  'מה יש לי היום?', 'מה יש לי מחר?', 'מה יש השבוע?', 'מה יש לאיתמר היום?', 'ומה יש לאיתמר השבוע?',
  'מי יכול להסיע את איתמר?', 'ומה עם מור?', 'למה?', 'אז מי כן?', 'אז תשלחי לו',
  'שלחת?', 'שלחתת?', 'למי שלחת?', 'מה הסטטוס?', 'אז תשלחי לו שוב', 'מי לוקח אותו?', 'ומה עם אחותו?',
  'מה שינית היום?', 'למה שינית את זה?', 'מאיזה מקור זה הגיע?',
  'מה האירוע הבא?', 'מי פנוי בערב?', 'מי פנוי בין 18:00 ל-20:00?',
  'תעשי את זה', 'מה מזג האוויר עכשיו?', 'מה כתבו עכשיו בוואטסאפ?',
  'תני לי ביחד אירועים, הסעות, משימות והחלטות',
]

async function run(viewport, prefix) {
  const context = await browser.newContext({ viewport, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await context.addInitScript(() => localStorage.setItem('family-autopilot-person', 'Mor'))
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5190', { waitUntil: 'networkidle' })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fampilot:showcase-reset')))
  await page.waitForTimeout(150)
  await page.evaluate(() => {
    const key = 'family-autopilot-he-v1'
    const data = JSON.parse(localStorage.getItem(key) || '{}')
    const at = offset => { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
    data.events.push(
      { id: 'qa-sim-expired', familyId: 'Avrahami', title: 'אירוע שפג', date: '2020-01-01', time: '08:00', endTime: '09:00', participantIds: ['Itamar'], responsibleId: '', icon: '⌛' },
      { id: 'qa-sim-ride', familyId: 'Avrahami', title: 'חוג רובוטיקה של איתמר', date: at(2), time: '19:00', endTime: '20:00', participantIds: ['Itamar'], responsibleId: '', requiresDriver: true, createdById: 'Mor', icon: '🤖' },
    )
    localStorage.setItem(key, JSON.stringify(data))
  })
  await page.reload({ waitUntil: 'networkidle' })
  const nav = page.locator('.nav-item[aria-label="LIA"], .mobile-nav button:has-text("LIA")')
  for (let index = 0; index < await nav.count(); index += 1) if (await nav.nth(index).isVisible()) { await nav.nth(index).click(); break }
  const input = page.getByRole('textbox', { name: 'שאלו את LIA' })
  const transcript = []
  for (const prompt of scenarios) {
    const before = await page.locator('.lia-chat-message.lia').count()
    await input.fill(prompt)
    await input.press('Enter')
    await page.waitForFunction(expected => document.querySelectorAll('.lia-chat-message.lia').length > expected, before)
    const answers = page.locator('.lia-chat-message.lia .lia-message-bubble')
    transcript.push({ prompt, answer: (await answers.last().innerText()).trim() })
    if (prompt === 'אז תשלחי לו' || prompt === 'מה כתבו עכשיו בוואטסאפ?') {
      await page.waitForTimeout(120)
      await page.locator('.lia-chat-message').last().scrollIntoViewIfNeeded()
      const name = prompt === 'אז תשלחי לו' ? 'ride-request-fixed' : 'safe-clarification-fixed'
      await page.screenshot({ path: path.join(output, `${prefix}-${name}.png`), fullPage: false })
    }
  }
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('family-autopilot-he-v1') || '{}'))
  assert.equal(state.events.some(event => event.id === 'qa-sim-expired'), false)
  const rideRequests = state.transportationRequests.filter(request => request.eventId === 'qa-sim-ride')
  assert.equal(rideRequests.length, 1)
  assert.equal(rideRequests[0].responses.Orel, 'PENDING')
  assert.equal((await page.locator('body').innerText()).includes('אירוע שפג'), false)
  assert.doesNotMatch(transcript.find(turn => turn.prompt === 'אז תשלחי לו').answer, /לא הצלחתי/)
  assert.match(transcript.find(turn => turn.prompt === 'תעשי את זה').answer, /לא ברור לי איזו פעולה/)
  assert.match(transcript.find(turn => turn.prompt === 'מה מזג האוויר עכשיו?').answer, /אין לי גישה למידע חי/)
  const count = await page.locator('.lia-chat-message').count()
  await page.reload({ waitUntil: 'networkidle' })
  const navAfter = page.locator('.nav-item[aria-label="LIA"], .mobile-nav button:has-text("LIA")')
  for (let index = 0; index < await navAfter.count(); index += 1) if (await navAfter.nth(index).isVisible()) { await navAfter.nth(index).click(); break }
  assert.equal(await page.locator('.lia-chat-message').count(), count)
  await page.screenshot({ path: path.join(output, `${prefix}-conversation.png`), fullPage: false })
  await context.close()
  return transcript
}

for (const [viewport, prefix] of [[{ width: 1440, height: 1000 }, 'desktop-1440'], [{ width: 390, height: 844 }, 'mobile-390']]) {
  const transcript = await run(viewport, prefix)
  console.log(`\n${prefix}`)
  for (const turn of transcript) console.log(`USER: ${turn.prompt}\nLIA: ${turn.answer}`)
}

await browser.close()
