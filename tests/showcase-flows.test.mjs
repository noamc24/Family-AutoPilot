import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const model = await load('src/data.ts')
const showcase = await load('src/showcaseFlows.ts')
const settings = await load('src/personalSettings.ts')
const lia = await load('src/liaInterventions.ts')
const fresh = () => structuredClone(model.initialData)
const owner = data => data.families[0].people.find(person => person.id === 'Mor')
const itemFor = (data, signalId) => data.liaInterventions.find(item => item.signalId === signalId)

function receive(data, kind, ownerId = 'Mor') {
  const signal = showcase.createDemoShowcaseSignal(data, 'Avrahami', ownerId, kind)
  assert.ok(signal)
  return { signal, data: showcase.receiveShowcaseSignal(data, signal) }
}

test('WhatsApp מורשה יוצר LiaIntervention נגזר בלי raw content', () => {
  const result = receive(fresh(), 'whatsapp-calendar')
  const item = itemFor(result.data, result.signal.id)
  assert.ok(item)
  assert.equal(item.sources[0].sourceId, 'whatsapp')
  assert.equal(item.sources[0].ownerMemberId, 'Mor')
  assert.ok(item.actions.some(action => action.kind === 'addToCalendar'))
  assert.doesNotMatch(JSON.stringify(item), /שיחת WhatsApp פרטית/)
  assert.match(result.signal.privatePayload, /פרטית/)
})

for (const state of ['disconnected', 'no-access']) test(`WhatsApp ${state} לא יוצר intervention`, () => {
  const data = fresh()
  const person = owner(data)
  person.personalSettings = state === 'disconnected'
    ? settings.updateConnection(person.personalSettings, 'whatsapp', false)
    : settings.updateLiaAccess(person.personalSettings, 'whatsapp', false)
  const result = receive(data, 'whatsapp-calendar')
  assert.equal(result.data, data)
})

test('אישור WhatsApp מעדכן Event אמיתי, מקשר Signal ויוצר Closure ללא כפילות', () => {
  const received = receive(fresh(), 'whatsapp-calendar')
  let data = showcase.applyShowcaseAction(received.data, itemFor(received.data, received.signal.id).id, 'addToCalendar', 'Mor')
  const event = data.events.find(event => event.id === 'football')
  const item = itemFor(data, received.signal.id)
  assert.equal(event.time, '16:30')
  assert.equal(event.sourceSignalId, received.signal.id)
  assert.equal(data.externalSignals.find(signal => signal.id === received.signal.id).resultEventId, event.id)
  assert.equal(item.status, 'completed')
  assert.equal(item.resolutionType, 'calendarUpdated')
  assert.ok(lia.buildLiaInterventions(data, 'Avrahami').some(entry => entry.id === item.id && entry.status === 'completed'))
  const repeated = showcase.applyShowcaseAction(data, item.id, 'addToCalendar', 'Mor')
  assert.equal(repeated.events.filter(entry => entry.sourceSignalId === received.signal.id).length, 1)
  assert.equal(repeated.activity.filter(entry => entry.id.includes(received.signal.id)).length, 2)
})

test('לא עכשיו משאיר את ה-WhatsApp intervention פתוח', () => {
  const received = receive(fresh(), 'whatsapp-calendar')
  const data = showcase.applyShowcaseAction(received.data, itemFor(received.data, received.signal.id).id, 'dismiss', 'Mor')
  assert.equal(itemFor(data, received.signal.id).status, 'decisionRequired')
})

test('School מורשה יוצר intervention ומשימה אמיתית עם dueDate, owner ו-reference', () => {
  const received = receive(fresh(), 'school-action')
  const pending = itemFor(received.data, received.signal.id)
  assert.ok(pending.actions.some(action => action.kind === 'createTask'))
  assert.doesNotMatch(JSON.stringify(pending), /פרטי הכיתה|הודעת בית הספר המלאה/)
  const data = showcase.applyShowcaseAction(received.data, pending.id, 'createTask', 'Mor')
  const task = data.tasks.find(task => task.sourceSignalId === received.signal.id)
  const closed = itemFor(data, received.signal.id)
  assert.equal(task.due, received.signal.taskCandidate.dueDate)
  assert.equal(task.ownerId, 'Mor')
  assert.equal(data.externalSignals.find(signal => signal.id === received.signal.id).resultTaskId, task.id)
  assert.equal(closed.status, 'completed')
  assert.equal(closed.resolutionType, 'taskCreated')
  const repeated = showcase.applyShowcaseAction(data, pending.id, 'createTask', 'Mor')
  assert.equal(repeated.tasks.filter(entry => entry.sourceSignalId === received.signal.id).length, 1)
})

test('School ללא access לא יוצר intervention ו-Members שונים נאכפים בנפרד', () => {
  const data = fresh()
  const mor = owner(data)
  mor.personalSettings = settings.updateLiaAccess(mor.personalSettings, 'school', false)
  assert.equal(receive(data, 'school-action').data, data)
  const orel = data.families[0].people.find(person => person.id === 'Orel')
  orel.personalSettings = settings.updateConnection(settings.updateLiaAccess(orel.personalSettings, 'school', true), 'school', true)
  assert.notEqual(receive(data, 'school-action', 'Orel').data, data)
})

test('refresh/קליטה חוזרת אינם מכפילים Signals, Interventions, Events או Tasks', () => {
  let first = receive(fresh(), 'school-action')
  let data = showcase.applyShowcaseAction(first.data, itemFor(first.data, first.signal.id).id, 'createTask', 'Mor')
  const restored = structuredClone(data)
  data = showcase.receiveShowcaseSignal(restored, first.signal)
  assert.equal(data.externalSignals.filter(item => item.id === first.signal.id).length, 1)
  assert.equal(data.liaInterventions.filter(item => item.signalId === first.signal.id).length, 1)
  assert.equal(data.tasks.filter(item => item.sourceSignalId === first.signal.id).length, 1)
})

test('Demo reset מסיר רק תוצרי Showcase ומחזיר את שני התרחישים להפעלה', () => {
  const original = fresh()
  const whatsapp = receive(original, 'whatsapp-calendar')
  let data = showcase.applyShowcaseAction(whatsapp.data, itemFor(whatsapp.data, whatsapp.signal.id).id, 'addToCalendar', 'Mor')
  const school = receive(data, 'school-action')
  data = showcase.applyShowcaseAction(school.data, itemFor(school.data, school.signal.id).id, 'createTask', 'Mor')
  const reset = showcase.resetShowcase(data, 'Avrahami')
  assert.equal(reset.events.find(event => event.id === 'football').time, original.events.find(event => event.id === 'football').time)
  assert.equal(reset.tasks.some(task => task.sourceSignalId), false)
  assert.ok(reset.tasks.some(task => task.id === 'groceries'))
  assert.equal(reset.externalSignals.length, 0)
  assert.equal(reset.liaInterventions.some(item => item.signalId), false)
  assert.equal(showcase.triggerShowcase(reset, 'Avrahami', 'Mor', 'whatsapp-calendar').created, true)
})

test('LiaCard משתמש ב-sourceDefinitions ו-child viewer אינו מקבל Showcase CTA', async () => {
  const received = receive(fresh(), 'school-action')
  const cardModule = await load('src/components/LiaCard.tsx')
  const sectionModule = await load('src/components/LiaHomeSection.tsx')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const item = itemFor(received.data, received.signal.id)
  const cardHtml = renderToStaticMarkup(cardModule.LiaCard({ item, onAction() {}, memberName: id => id === 'Mor' ? 'מור' : id }))
  assert.match(cardHtml, /🏫.*בית ספר.*של מור/s)
  assert.doesNotMatch(cardHtml, /הודעת בית הספר המלאה|פרטי הכיתה/)
  const childHtml = renderToStaticMarkup(sectionModule.LiaHomeSection({ data: received.data, family: received.data.families[0], actorId: 'Itamar' }))
  assert.doesNotMatch(childHtml, /צור משימה|אישור הורים/)
})
