import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import fs from 'node:fs'

const result = await build({
  stdin: { contents: `export * from './src/data.ts'`, resolveDir: process.cwd(), sourcefile: 'deletion-entry.ts', loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const model = module.exports

const person = id => ({ id, name: id, role: 'אב', color: 'sage', age: 35, hasLicense: false, hasCar: false, availableForPickup: false, personalSettings: model.defaultPersonalSettings() })
const fixture = () => ({
  families: [{ id: 'f1', name: 'ראשונה', people: [person('p1'), person('p2')] }, { id: 'f2', name: 'שנייה', people: [person('p3')] }],
  events: [
    { id: 'e1', familyId: 'f1', title: 'של p1', date: model.localDate(1), time: '10:00', icon: '•', participantIds: ['p1'], responsibleId: 'p1', createdById: 'p1', details: '' },
    { id: 'e2', familyId: 'f1', title: 'של p2', date: model.localDate(1), time: '12:00', icon: '•', participantIds: ['p2'], responsibleId: 'p2', details: '' },
    { id: 'e3', familyId: 'f2', title: 'משפחה שנייה', date: model.localDate(1), time: '14:00', icon: '•', participantIds: ['p3'], responsibleId: 'p3', details: '' },
  ],
  tasks: [{ id: 't1', familyId: 'f1', title: 'של p1', ownerId: 'p1', due: model.localDate(1), done: false }, { id: 't2', familyId: 'f1', title: 'של p2', ownerId: 'p2', due: model.localDate(1), done: false }, { id: 't3', familyId: 'f2', title: 'של p3', ownerId: 'p3', due: model.localDate(1), done: false }],
  activity: [{ id: 'a1', familyId: 'f1', text: '', personIds: ['p1'] }, { id: 'a2', familyId: 'f2', text: '', personIds: ['p3'] }],
  transportationRequests: [
    { id: 'r1', familyId: 'f1', eventId: 'e1', passengerId: 'p1', eligibleMemberIds: ['p1', 'p2'], responses: { p1: 'PENDING', p2: 'PENDING' }, selectedDriverId: 'p1', status: 'OPEN', createdById: 'p1', origin: '', destination: '', requiredAt: '' },
    { id: 'r2', familyId: 'f1', eventId: 'e2', passengerId: 'p2', eligibleMemberIds: ['p1', 'p2'], responses: { p1: 'PENDING', p2: 'PENDING' }, selectedDriverId: 'p1', status: 'OPEN', createdById: 'p2', origin: '', destination: '', requiredAt: '' },
  ],
  integrationLogs: [{ id: 'i1', familyId: 'f1', scenarioKey: '', source: 'calendar', sourceText: '', action: '', personIds: ['p1'], eventId: 'e1', createdAt: '' }],
  calendarMirrors: [{ id: 'm1', familyId: 'f1', eventId: 'e1', personId: 'p1', provider: 'google', createdAt: '' }],
  acknowledgements: [{ eventId: 'e1', personId: 'p1', signature: '', status: 'pending' }],
  suppressedRoutineTaskIds: ['t1', 't3'],
  pendingActions: [{ id: 'pending:f1', familyId: 'f1', source: 'scenario', scenarioId: '', message: '', createdAt: '' }],
  dismissedActionIds: ['decision:f1:item', 'decision:f2:item'],
  trafficSignals: [{ id: 'traffic1', familyId: 'f1', source: 'waze', relatedEventId: 'e1', previousTravelMinutes: 10, currentTravelMinutes: 20, timestamp: '', severity: 'meaningful' }],
  externalSignals: [{ id: 'signal1', familyId: 'f1', sourceId: 'calendar', ownerMemberId: 'p1', receivedAt: '', privatePayload: '', familyInsight: '', signalType: 'newEvent', status: 'detected', eventCandidate: { title: '', date: '', time: '', relatedMemberId: 'p1', targetEventId: 'e1' } }],
  liaInterventions: [{ id: 'lia1', familyId: 'f1', type: 'calendar', title: '', detectedChange: '', whyItMatters: '', recommendation: '', sources: [], actions: [], status: 'waiting', explanation: '', relatedEventId: 'e1', relatedMemberIds: ['p1'], createdAt: '', updatedAt: '', visibility: { audience: 'family' } }],
  liaConversations: [{ familyId: 'f1', memberId: 'p1', messages: [], context: {}, updatedAt: '' }],
})

test('מחיקת בן משפחה מנקה הפניות תלויות ושומרת חברים והגדרות אחרים', () => {
  const before = fixture()
  const otherSettings = structuredClone(before.families[0].people[1].personalSettings)
  const cleaned = model.removePersonAndTheirData(before, 'f1', 'p1')
  assert.deepEqual(cleaned.families.find(item => item.id === 'f1').people.map(item => item.id), ['p2'])
  assert.deepEqual(cleaned.families.find(item => item.id === 'f1').people[0].personalSettings, otherSettings)
  assert.deepEqual(cleaned.events.map(item => item.id), ['e2', 'e3'])
  assert.deepEqual(cleaned.tasks.map(item => item.id), ['t2', 't3'])
  assert.deepEqual(cleaned.transportationRequests.map(item => item.id), ['r2'])
  assert.deepEqual(cleaned.transportationRequests[0].eligibleMemberIds, ['p2'])
  assert.equal(cleaned.transportationRequests[0].selectedDriverId, '')
  assert.equal(cleaned.trafficSignals.length, 0)
  assert.equal(cleaned.externalSignals.length, 0)
  assert.equal(cleaned.liaInterventions.length, 0)
  assert.equal(cleaned.liaConversations.length, 0)
})

test('מחיקת משפחה מוחקת רק את ה-scope שלה ותומכת במחיקת המשפחה האחרונה', () => {
  const cleaned = model.removeFamilyAndTheirData(fixture(), 'f1')
  assert.deepEqual(cleaned.families.map(item => item.id), ['f2'])
  for (const collection of ['events', 'tasks', 'activity']) assert.ok(cleaned[collection].every(item => item.familyId === 'f2'))
  for (const collection of ['transportationRequests', 'integrationLogs', 'calendarMirrors', 'pendingActions', 'trafficSignals', 'externalSignals', 'liaInterventions', 'liaConversations']) assert.ok(cleaned[collection].every(item => item.familyId !== 'f1'))
  assert.deepEqual(cleaned.suppressedRoutineTaskIds, ['t3'])
  assert.deepEqual(cleaned.dismissedActionIds, ['decision:f2:item'])
  const empty = model.removeFamilyAndTheirData(cleaned, 'f2')
  assert.equal(empty.families.length, 0)
  assert.equal(model.hasCompletedOnboarding(empty), false)
})

test('מצב לאחר מחיקת המשפחה האחרונה נשמר ונטען כ-first-time state', () => {
  const empty = model.removeFamilyAndTheirData(model.removeFamilyAndTheirData(fixture(), 'f1'), 'f2')
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: key => key === model.APP_DATA_STORAGE_KEY ? JSON.stringify(empty) : null }
  try { assert.equal(model.readData().families.length, 0) }
  finally { globalThis.localStorage = originalStorage }
})

test('פעולות המחיקה נשארות בהרשאת מבוגר ובניסוח מפורש', () => {
  const familyView = fs.readFileSync('src/components/FamilyView.tsx', 'utf8')
  const app = fs.readFileSync('src/App.tsx', 'utf8')
  assert.match(familyView, /!childMode.*מחיקת המשפחה/s)
  assert.match(familyView, /!childMode.*מחיקת בן משפחה/s)
  assert.match(app, /למחוק את בן המשפחה \$\{item\.name\}/)
  assert.match(app, /למחוק את המשפחה.*\$\{item\.name\}/s)
})
