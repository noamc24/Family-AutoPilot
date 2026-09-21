import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const model = await load('src/data.ts')
const coordination = await load('src/coordination.ts')
const forecast = await load('src/forecast.ts')
const integrations = await load('src/integrationScenarios.ts')
const makeEvent = (id, date, time, people, responsibleId = '', requiresDriver = false) => ({ id, familyId: 'cohen', title: id, date, time, icon: '📅', participantIds: people, responsibleId, details: '', requiresDriver })
const fresh = () => structuredClone(model.initialData)

test('יומן וניווט יוצרים יחד בעיית הסעה עתידית אמיתית', () => {
  let data = fresh()
  const date = model.localDate(1)
  data.events = [makeEvent('אימון', date, '17:00', ['yuval', 'adam'], 'adam', true)]
  data.tasks = []
  data = coordination.ensureRequests(data, 'adam')
  const calendar = integrations.runExternalScenario(data, 'cohen', 'adam', 'calendar-meeting')
  assert.equal(calendar.applied, true)
  assert.equal(calendar.data.events.find(event => event.id === 'אימון').responsibleId, 'adam')
  const traffic = integrations.runExternalScenario(calendar.data, 'cohen', 'adam', 'waze-accident')
  assert.equal(traffic.applied, true)
  data = traffic.data
  assert.equal(data.events.find(event => event.id === 'אימון').responsibleId, '')
  assert.ok(coordination.requestForEvent(data, 'אימון'))
  assert.ok(forecast.scanFutureRisks(data, 'cohen').some(risk => risk.sourceNote?.includes('וויז')))
  assert.ok(data.integrationLogs.some(log => log.source === 'calendar'))
  assert.ok(data.integrationLogs.some(log => log.source === 'waze'))
})

test('הודעת וואטסאפ משנה מועד ומייצרת חפיפה עתידית', () => {
  const date = model.localDate(1)
  const data = fresh()
  data.events = [makeEvent('אימון', date, '17:00', ['yuval'], 'adam', true), makeEvent('חבר', date, '16:30', ['yuval'])]
  data.tasks = []
  const result = integrations.runExternalScenario(data, 'cohen', 'adam', 'whatsapp-earlier')
  assert.equal(result.applied, true)
  assert.equal(result.data.events.find(event => event.id === 'אימון').time, '16:30')
  assert.ok(forecast.scanFutureRisks(result.data, 'cohen').some(risk => risk.kind === 'overlap'))
  assert.match(result.data.events.find(event => event.id === 'אימון').sourceNote, /וואטסאפ/)
})

test('מייל על סיום מוקדם מוסיף איסוף ואינו מוכפל ברענון', () => {
  const first = integrations.runExternalScenario(fresh(), 'cohen', 'maya', 'email-school-early')
  assert.equal(first.applied, true)
  const event = first.data.events.find(item => /איסוף מוקדם/.test(item.title))
  assert.ok(coordination.requestForEvent(first.data, event.id))
  assert.match(event.sourceNote, /מייל מבית הספר/)
  const storage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(first.data) }
  try {
    const restored = model.readData()
    assert.equal(restored.events.find(item => item.id === event.id).sourceNote, event.sourceNote)
    assert.equal(integrations.runExternalScenario(restored, 'cohen', 'maya', 'email-school-early').applied, false)
  } finally { globalThis.localStorage = storage }
})

test('סריקה מראש מזהה שתי הסעות, משימה חשובה ויום עמוס; אישור פתרון מזיז נתונים', () => {
  const date = model.localDate(1)
  let data = fresh()
  data.events = [makeEvent('הסעה א', date, '15:00', ['yuval'], 'maya', true), makeEvent('הסעה ב', date, '16:00', ['noa'], 'maya', true), makeEvent('הסעה ג', date, '18:00', ['yuval'], 'adam', true)]
  data.tasks = [{ id: 'קניות', familyId: 'cohen', title: 'קניות', ownerId: 'maya', due: date, done: false, requiresAdult: true }]
  data = coordination.ensureRequests(data, 'maya')
  const risks = forecast.scanFutureRisks(data, 'cohen')
  assert.ok(risks.some(risk => risk.kind === 'double-ride'))
  assert.ok(risks.some(risk => risk.kind === 'task'))
  assert.ok(risks.some(risk => risk.kind === 'busy-day'))
  const taskRisk = risks.find(risk => risk.kind === 'task')
  const solved = forecast.applyForecastSolution(data, taskRisk)
  assert.equal(solved.tasks.find(task => task.id === 'קניות').due, model.localDate(2))
})

test('טעינה מנקה תווי קידוד פגומים בלי למחוק אירועים', () => {
  const data = fresh()
  data.events[0].details = 'תור' + String.fromCharCode(0xfffd)
  const storage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try {
    const restored = model.readData()
    assert.equal(restored.events.find(event => event.id === 'dentist').details, 'תור')
    assert.equal(restored.events.length, data.events.length)
  } finally { globalThis.localStorage = storage }
})
