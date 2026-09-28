import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const output = path.resolve('screenshots/home-final-polish')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })

async function settle(page) {
  await page.locator('.view-home').waitFor({ timeout: 10000 })
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]))
  await page.waitForTimeout(220)
}

async function shot(page, name) {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelectorAll('*').forEach(element => { if (element.scrollTop > 0) element.scrollTop = 0 })
  })
  await settle(page)
  await page.screenshot({ path: path.join(output, name), fullPage: false })
}

async function open(viewport, calmMode) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  if (calmMode) await context.addInitScript(mode => {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    const current = now.getHours() * 60 + now.getMinutes()
    const first = Math.min(current + 20, 23 * 60 + 20)
    const second = Math.min(Math.max(first + 35, current + 55), 23 * 60 + 55)
    const parent = { id: 'parent', name: 'נועה', role: 'אם', color: 'sage', age: 38, hasLicense: true, hasCar: true, availableForPickup: true, routines: [] }
    const child = { id: 'child', name: 'איתי', role: 'בן', color: 'lavender', age: 9, hasLicense: false, hasCar: false, availableForPickup: false, routines: [] }
    const events = mode === 'future' ? [
      { id: 'past', familyId: 'quiet-home', title: 'פריט עבר שלא אמור להופיע', date, time: clock(Math.max(0, current - 60)), icon: '•', participantIds: ['parent'], responsibleId: 'parent', details: '' },
      { id: 'future-two', familyId: 'quiet-home', title: 'אסיפת הורים', date, time: clock(second), icon: '•', participantIds: ['parent', 'child'], responsibleId: 'parent', details: '' },
      { id: 'future-one', familyId: 'quiet-home', title: 'איסוף מאימון', date, time: clock(first), icon: '•', participantIds: ['parent', 'child'], responsibleId: 'parent', details: '' },
    ] : []
    localStorage.setItem('family-autopilot-he-v1', JSON.stringify({
      families: [{ id: 'quiet-home', name: 'משפחת שלו', people: [parent, child] }], events, tasks: [], activity: [], transportationRequests: [], integrationLogs: [], calendarMirrors: [], acknowledgements: [], suppressedRoutineTaskIds: [], pendingActions: [], dismissedActionIds: [], trafficSignals: [], externalSignals: [], liaInterventions: [], liaConversations: [],
    }))
    localStorage.setItem('family-autopilot-family', 'quiet-home')
    localStorage.setItem('family-autopilot-person', 'parent')
  }, calmMode)
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'domcontentloaded', timeout: 10000 })
  await settle(page)
  return { context, page }
}

async function assertCalm(page, expectedRows) {
  const visibleAllGood = page.locator('.lia-all-good:visible')
  if (await visibleAllGood.count() !== 1) throw new Error('Calm Home must show exactly one visible all-good state')
  if (await page.locator('.home-brief .brief-row:visible').count() !== expectedRows) throw new Error(`Expected ${expectedRows} future brief rows`)
  if (await page.locator('.home-brief').getByText('פריט עבר שלא אמור להופיע').count()) throw new Error('Past event leaked into future brief')
  if (expectedRows === 2) {
    const titles = await page.locator('.home-brief .brief-row strong').allTextContents()
    if (!titles[0]?.includes('איסוף מאימון') || !titles[1]?.includes('אסיפת הורים')) throw new Error('Future brief is not chronological')
  }
}

async function assertActive(page) {
  const active = page.locator('.lia-card-decisionRequired:visible').first()
  await active.waitFor()
  const allGoodCount = await page.locator('.lia-all-good:visible').count()
  if (allGoodCount) throw new Error('Active Home must not show the calm state')
  return active
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const prefix = viewport.width === 1440 ? 'desktop' : 'mobile'
  {
    const { context, page } = await open(viewport, 'future')
    await assertCalm(page, 2)
    await shot(page, `${prefix}-calm-future-${viewport.width}x${viewport.height}.png`)
    await context.close()
  }
  if (viewport.width === 1440) {
    const { context, page } = await open(viewport, 'empty')
    await assertCalm(page, 0)
    await page.getByText('אין עוד דברים מתוכננים להיום.').waitFor()
    await shot(page, `desktop-calm-empty-${viewport.width}x${viewport.height}.png`)
    await context.close()
  }
  {
    const { context, page } = await open(viewport)
    const active = await assertActive(page)
    await shot(page, `${prefix}-active-${viewport.width}x${viewport.height}.png`)
    await active.getByRole('button', { name: 'לא יכול/ה' }).click()
    await page.locator('.lia-card-waiting:visible').first().waitFor()
    await shot(page, `${prefix}-waiting-${viewport.width}x${viewport.height}.png`)
    await context.close()
  }
  {
    const { context, page } = await open(viewport)
    const active = await assertActive(page)
    await active.getByRole('button', { name: 'אני מטפל/ת' }).click()
    const inProgress = page.locator('.lia-card-inProgress:visible').first()
    await inProgress.getByRole('button', { name: 'אישור וסיום' }).click()
    await page.locator('.lia-handled:visible').waitFor()
    await page.evaluate(() => {
      const key = 'family-autopilot-he-v1'
      const data = JSON.parse(localStorage.getItem(key))
      data.externalSignals = [{ id: 'qa-resolved', familyId: 'Avrahami', sourceId: 'whatsapp', ownerMemberId: 'Orel', receivedAt: new Date().toISOString(), privatePayload: '', familyInsight: '', signalType: 'task', status: 'handled' }]
      data.liaInterventions = (data.liaInterventions || []).filter(item => item.status === 'completed')
      localStorage.setItem(key, JSON.stringify(data))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await settle(page)
    if (await page.locator('.lia-handled li:visible').count() > 2) throw new Error('Resolved history is not compact')
    await shot(page, `${prefix}-resolved-${viewport.width}x${viewport.height}.png`)
    await context.close()
  }
}

await browser.close()
console.log(`Captured Home Final Polish screenshots in ${output}`)
