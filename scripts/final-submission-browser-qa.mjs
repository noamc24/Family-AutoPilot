import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/noamc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const base = 'http://127.0.0.1:5180'

async function open(viewport = { width: 1440, height: 1000 }, person = 'Mor') {
  const context = await browser.newContext({ viewport, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await context.addInitScript(id => localStorage.setItem('family-autopilot-person', id), person)
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.locator('.view-home').waitFor()
  return { context, page }
}

async function nav(page, label) {
  const choices = page.locator(`.nav-item[aria-label="${label}"], .mobile-nav button:has-text("${label}")`)
  for (let index = 0; index < await choices.count(); index += 1) if (await choices.nth(index).isVisible()) { await choices.nth(index).click(); return }
  throw new Error(`Navigation target not visible: ${label}`)
}

async function reset(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fampilot:showcase-reset')))
  await page.waitForFunction(() => {
    const data = JSON.parse(localStorage.getItem('family-autopilot-he-v1') || '{}')
    return (data.liaInterventions || []).length === 0 && (data.externalSignals || []).length === 0 && (data.trafficSignals || []).length === 0
  })
}

async function trigger(page, kind) {
  await page.evaluate(value => window.dispatchEvent(new CustomEvent('fampilot:showcase-trigger', { detail: { kind: value } })), kind)
  await page.waitForTimeout(100)
}

async function stored(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('family-autopilot-he-v1') || '{}')) }

// Reset cleanliness and the two signal-driven showcase flows, each in isolation.
for (const kind of ['whatsapp-calendar', 'school-action']) {
  console.log(`Checking ${kind}`)
  const { context, page } = await open()
  await reset(page)
  let data = await stored(page)
  assert.equal((data.externalSignals || []).length, 0)
  assert.equal((data.liaInterventions || []).filter(item => item.signalId).length, 0)
  await trigger(page, kind)
  const card = page.locator('.lia-card').filter({ hasText: kind === 'whatsapp-calendar' ? 'שינוי באירוע' : 'דורש פעולה' }).first()
  await card.waitFor()
  const primary = kind === 'whatsapp-calendar' ? 'אישור ועדכון' : 'אישור ויצירת משימה'
  await card.getByRole('button', { name: primary }).waitFor()
  await card.getByRole('button', { name: 'דחייה' }).waitFor()
  await trigger(page, kind)
  data = await stored(page)
  assert.equal(data.externalSignals.length, 1)
  assert.equal(data.liaInterventions.filter(item => item.signalId).length, 1)
  await card.getByRole('button', { name: primary }).click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  data = await stored(page)
  assert.equal(data.externalSignals.length, 1)
  assert.equal(data.liaInterventions.filter(item => item.signalId).length, 1)
  assert.equal(data.liaInterventions.find(item => item.signalId).status, 'completed')
  if (kind === 'whatsapp-calendar') assert.equal(data.events.filter(item => item.sourceSignalId).length, 1)
  else assert.equal(data.tasks.filter(item => item.sourceSignalId).length, 1)
  await context.close()
}

// Traffic flow from its actual UI control, including action and refresh persistence.
{
  console.log('Checking traffic flow')
  const { context, page } = await open({ width: 1440, height: 1000 }, 'Orel')
  await reset(page)
  await nav(page, 'עוד')
  const traffic = page.locator('.showcase-scenarios > div').filter({ hasText: 'עומס בדרך' })
  await traffic.getByRole('button', { name: /הדגם הגעה/ }).click()
  await page.waitForTimeout(200)
  const trafficDebug = await stored(page)
  assert.equal(await page.locator('.view-home').count(), 1, JSON.stringify({ toast: await page.locator('.toast').allTextContents(), event: trafficDebug.events?.find(item => item.id === 'traffic-pickup'), traffic: trafficDebug.trafficSignals, interventions: trafficDebug.liaInterventions }))
  const card = page.locator('.lia-card').filter({ hasText: 'עומס בדרך' }).first()
  await card.getByRole('button').first().waitFor()
  await card.getByRole('button').first().click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  const data = await stored(page)
  assert.equal(data.liaInterventions.filter(item => item.type === 'traffic').length, 1)
  await context.close()
}

// Calendar renderers, task filters, family modes, chat action/persistence and settings navigation.
{
  console.log('Checking desktop product flows')
  const { context, page } = await open()
  await nav(page, 'יומן')
  const expected = [['יומי', 'day', '.time-grid.days-1'], ['שבועי', 'week', '.time-grid.days-7'], ['חודשי', 'month', '.month-grid'], ['שנתי', 'year', '.year-grid']]
  for (const [label, range, selector] of expected) {
    await page.getByRole('button', { name: label, exact: true }).click()
    assert.equal(await page.locator('.calendar-v2').getAttribute('data-range'), range)
    await page.locator(selector).waitFor()
  }
  await page.getByRole('button', { name: 'חודשי', exact: true }).click()
  assert.ok(await page.locator('.month-event.routine').count() > 0)
  await nav(page, 'משימות')
  for (const label of ['היום', 'השבוע', 'הכל']) { await page.getByRole('button', { name: label, exact: true }).click(); assert.ok(await page.locator('.tasks-v2').isVisible()) }
  await nav(page, 'משפחה')
  await page.locator('.person-row').first().click()
  await page.locator('.member-profile').waitFor()
  await page.getByRole('button', { name: 'סגירה' }).click()
  await nav(page, 'LIA')
  await page.locator('.lia-quick-prompts button').first().click()
  await page.getByRole('textbox', { name: 'שאלו את LIA' }).fill('מי יכול לקחת את איתמר לחוג?')
  await page.getByRole('textbox', { name: 'שאלו את LIA' }).press('Enter')
  await page.locator('.lia-chat-action-card').waitFor()
  await page.locator('.lia-chat-action-card > button').click()
  const messageCount = await page.locator('.lia-chat-message').count()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await nav(page, 'LIA')
  assert.equal(await page.locator('.lia-chat-message').count(), messageCount)
  await page.locator('.profile-button').evaluate(element => element.click())
  await page.locator('.menu-settings').evaluate(element => element.click())
  await page.locator('.settings-page').waitFor()
  await context.close()
}

// Child privacy and mobile navigation/overflow.
for (const [viewport, person] of [[{ width: 1440, height: 1000 }, 'Itamar'], [{ width: 390, height: 844 }, 'Mor']]) {
  console.log(`Checking ${person} at ${viewport.width}px`)
  const { context, page } = await open(viewport, person)
  if (person === 'Itamar') {
    await nav(page, 'משפחה')
    assert.equal(await page.locator('.person-row').count(), 0)
    assert.equal((await page.locator('body').innerText()).includes('ניהול המשפחה'), false)
  } else {
    for (const label of ['בית', 'יומן', 'משפחה', 'משימות', 'LIA']) await nav(page, label)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    assert.ok(overflow <= 1, `mobile horizontal overflow: ${overflow}px`)
  }
  await context.close()
}

await browser.close()
console.log('Final browser QA passed: showcase flows, refresh, navigation, ranges, tasks, family, chat, settings and mobile.')
