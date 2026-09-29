import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const dataModel = await load('src/data.ts')
const showcase = await load('src/showcaseFlows.ts')
const domain = await load('src/domain.ts')
const traffic = await load('src/liaCoreFlow.ts')
const workflow = await load('src/workflow.ts')
const fresh = () => structuredClone(dataModel.initialData)

function pendingChange() {
  const data = fresh()
  const signal = showcase.createDemoShowcaseSignal(data, 'Avrahami', 'Mor', 'whatsapp-calendar')
  assert.ok(signal)
  const received = showcase.receiveShowcaseSignal(data, signal)
  return { signal, data: received, item: received.liaInterventions.find(entry => entry.signalId === signal.id) }
}

test('user-facing assistant copy uses LIA and detected change exposes approve/reject', () => {
  const sources = ['src/components/LiaCard.tsx', 'src/components/LiaHomeSection.tsx', 'src/components/LiaChatPreview.tsx', 'src/components/SettingsPage.tsx'].map(file => readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(sources, /ליה/)
  const { item } = pendingChange()
  assert.deepEqual(item.actions.map(action => action.kind), ['addToCalendar', 'dismiss'])
  assert.match(item.actions[0].label, /אישור/)
  assert.match(item.actions[1].label, /דחייה/)
})

test('approval applies exactly once and resolves with concrete event summary', () => {
  const pending = pendingChange()
  const approved = showcase.applyShowcaseAction(pending.data, pending.item.id, 'addToCalendar', 'Mor')
  const repeated = showcase.applyShowcaseAction(approved, pending.item.id, 'addToCalendar', 'Mor')
  const event = approved.events.find(entry => entry.id === pending.signal.eventCandidate.targetEventId)
  const intervention = approved.liaInterventions.find(entry => entry.id === pending.item.id)
  assert.equal(event.time, pending.signal.eventCandidate.time)
  assert.equal(approved.events.filter(entry => entry.sourceSignalId === pending.signal.id).length, 1)
  assert.deepEqual(repeated, approved)
  assert.equal(intervention.status, 'completed')
  assert.match(intervention.resolutionSummary, /LIA עדכנה את האירוע/)
  assert.match(intervention.resolutionSummary, /16:30/)
})

test('rejection persists as noAction and never mutates the event', () => {
  const pending = pendingChange()
  const before = pending.data.events.find(entry => entry.id === pending.signal.eventCandidate.targetEventId)
  const rejected = showcase.applyShowcaseAction(pending.data, pending.item.id, 'dismiss', 'Mor')
  const after = rejected.events.find(entry => entry.id === before.id)
  const intervention = rejected.liaInterventions.find(entry => entry.id === pending.item.id)
  assert.deepEqual(after, before)
  assert.equal(intervention.status, 'noAction')
  assert.deepEqual(intervention.actions, [])
  assert.equal(rejected.externalSignals.find(entry => entry.id === pending.signal.id).status, 'handled')
})

test('LIA event keeps provenance and can be edited and deleted through existing domain logic', () => {
  const pending = pendingChange()
  const approved = showcase.applyShowcaseAction(pending.data, pending.item.id, 'addToCalendar', 'Mor')
  const event = approved.events.find(entry => entry.sourceSignalId === pending.signal.id)
  assert.ok(event.sourceNote)
  const edited = domain.saveEventAndDependents(approved, { ...event, title: 'אימון מעודכן' }, 'Mor')
  assert.equal(edited.events.find(entry => entry.id === event.id).title, 'אימון מעודכן')
  const deleted = domain.removeEventAndDependents(edited, event.id)
  assert.equal(deleted.events.some(entry => entry.id === event.id), false)
  assert.equal(deleted.transportationRequests.some(entry => entry.eventId === event.id), false)
})

test('submission seed and demo reset remain current and child permissions stay guarded', () => {
  const today = dataModel.localDate()
  assert.ok(dataModel.initialData.events.every(event => event.date >= today))
  assert.ok((dataModel.initialData.liaInterventions || []).every(item => !['decisionRequired', 'waiting'].includes(item.status)))
  const pending = pendingChange()
  const reset = showcase.resetShowcase(pending.data, 'Avrahami')
  const nextSignal = showcase.createDemoShowcaseSignal(reset, 'Avrahami', 'Mor', 'school-action')
  assert.ok(nextSignal.taskCandidate.dueDate >= today)
  const calendar = readFileSync('src/components/CalendarView.tsx', 'utf8')
  assert.match(calendar, /event && !childMode/)
})

test('Demo reset removes every active, handled and transport demo artifact but keeps schedules and user data', () => {
  const original = fresh()
  const userEvent = { id: 'user-event', familyId: 'Avrahami', title: 'אירוע משתמש', date: dataModel.localDate(5), time: '18:00', icon: '•', participantIds: ['Mor'], responsibleId: 'Mor', details: '', createdById: 'Mor' }
  let dirty = { ...original, events: [...original.events, userEvent] }
  const whatsapp = showcase.createDemoShowcaseSignal(dirty, 'Avrahami', 'Mor', 'whatsapp-calendar')
  dirty = showcase.receiveShowcaseSignal(dirty, whatsapp)
  dirty = showcase.applyShowcaseAction(dirty, dirty.liaInterventions.find(item => item.signalId === whatsapp.id).id, 'addToCalendar', 'Mor')
  dirty = traffic.initializeTrafficCoreFlow(dirty)
  const reset = showcase.resetSubmissionDemo(dirty, 'Avrahami')
  const synced = workflow.syncAcknowledgements(reset)
  assert.equal((reset.liaInterventions || []).filter(item => item.familyId === 'Avrahami').length, 0)
  assert.equal((reset.externalSignals || []).filter(item => item.familyId === 'Avrahami').length, 0)
  assert.equal((reset.trafficSignals || []).filter(item => item.familyId === 'Avrahami').length, 0)
  assert.equal(reset.transportationRequests.filter(item => item.familyId === 'Avrahami').length, 0)
  assert.equal((reset.pendingActions || []).filter(item => item.familyId === 'Avrahami').length, 0)
  assert.equal((reset.acknowledgements || []).filter(item => ['dentist', 'dance', 'football', 'traffic-pickup', 'dinner', 'grandma-babka', 'pickup', 'trip'].includes(item.eventId)).length, 0)
  assert.equal((synced.acknowledgements || []).filter(item => ['dentist', 'dance', 'football', 'traffic-pickup', 'dinner', 'grandma-babka', 'pickup', 'trip'].includes(item.eventId)).length, 0)
  assert.ok(reset.events.some(event => event.id === 'user-event'))
  assert.ok(reset.families[0].people.some(person => (person.routines || []).length > 0))
  assert.ok(reset.events.filter(event => ['dentist', 'dance', 'football', 'traffic-pickup', 'dinner', 'grandma-babka', 'pickup', 'trip'].includes(event.id)).every(event => event.date >= dataModel.localDate()))
  assert.ok(reset.events.filter(event => ['dentist', 'dance', 'football', 'traffic-pickup', 'dinner', 'grandma-babka', 'pickup', 'trip'].includes(event.id)).every(event => !event.needsAttention && (!event.requiresDriver || event.responsibleId)))
  const resetTrafficEvent = reset.events.find(event => event.id === 'traffic-pickup')
  assert.equal(resetTrafficEvent.routeMinutes, undefined)
  assert.equal(resetTrafficEvent.departureTime, undefined)
  assert.equal(resetTrafficEvent.sourceNote, undefined)
})

test('reset leaves zero demo handled history and clears the reset notification', () => {
  const original = fresh()
  const signal = showcase.createDemoShowcaseSignal(original, 'Avrahami', 'Mor', 'whatsapp-calendar')
  const received = showcase.receiveShowcaseSignal(original, signal)
  const handled = showcase.applyShowcaseAction(received, received.liaInterventions.find(item => item.signalId === signal.id).id, 'addToCalendar', 'Mor')
  const reset = showcase.resetSubmissionDemo(handled, 'Avrahami')
  assert.equal((reset.liaInterventions || []).filter(item => item.familyId === 'Avrahami' && ['completed', 'noAction'].includes(item.status)).length, 0)
  assert.equal(reset.activity.filter(item => item.familyId === 'Avrahami' && item.id.startsWith('activity:showcase:')).length, 0)
  assert.equal((reset.externalSignals || []).filter(item => item.familyId === 'Avrahami' && item.status === 'handled').length, 0)
  const app = readFileSync('src/App.tsx', 'utf8')
  assert.match(app, /const clean = resetSubmissionDemo\(previous, family\.id\)/)
  assert.match(app, /dataRef\.current = clean/)
  assert.match(app, /setToast\(''\)/)
})

test('all three demo scenarios can start fresh after submission reset', () => {
  const reset = showcase.resetSubmissionDemo(fresh(), 'Avrahami')
  assert.equal(showcase.triggerShowcase(reset, 'Avrahami', 'Mor', 'whatsapp-calendar').created, true)
  assert.equal(showcase.triggerShowcase(reset, 'Avrahami', 'Mor', 'school-action').created, true)
  const trafficResult = traffic.triggerTrafficCoreFlow(reset)
  assert.ok(trafficResult.liaInterventions.some(item => item.type === 'traffic' && item.status === 'decisionRequired'))
  assert.equal(traffic.triggerTrafficCoreFlow(trafficResult), trafficResult)
})

test('date and time controls request Hebrew locale and 24-hour minute steps', () => {
  const app = readFileSync('src/App.tsx', 'utf8')
  assert.match(app, /lang: 'he-IL'/)
  assert.match(app, /inputType === 'time'.*step: 60/s)
  assert.doesNotMatch(readFileSync('src/components/CalendarView.tsx', 'utf8'), /toLocaleTimeString\(\)/)
})
