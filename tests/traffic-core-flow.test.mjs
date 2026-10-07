import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const model = await load('src/data.ts')
const flow = await load('src/liaCoreFlow.ts')
const traffic = await load('src/trafficSignals.ts')
const coordination = await load('src/coordination.ts')
const fresh = () => structuredClone(model.initialData)
const signal = (overrides = {}) => ({ id: 'signal-test', familyId: 'Avrahami', source: 'waze', relatedEventId: 'traffic-pickup', previousTravelMinutes: 18, currentTravelMinutes: 31, timestamp: new Date().toISOString(), severity: 'meaningful', ...overrides })
const initialized = () => flow.initializeTrafficCoreFlow(fresh())
const initializedWithMorAvailable = () => {
  const data = initialized()
  const mor = data.families[0].people.find(person => person.id === 'Mor')
  mor.routines = []
  mor.availability = 'available'
  mor.unavailableUntil = undefined
  data.events = data.events.filter(event => event.id === 'traffic-pickup')
  data.events[0].date = model.localDate(1)
  return data
}
const intervention = data => data.liaInterventions.find(item => item.type === 'traffic')

test('Traffic signal משמעותי יוצר intervention המקושר לאירוע אמיתי', () => {
  const data = flow.createTrafficIntervention(fresh(), signal())
  assert.equal(data.trafficSignals.length, 1)
  assert.equal(intervention(data).relatedEventId, 'traffic-pickup')
  assert.match(intervention(data).detectedChange, /18.*31/)
  assert.equal(data.events.find(item => item.id === 'traffic-pickup').routeMinutes, 31)
})

test('שינוי קטן מסף ה-MVP אינו יוצר intervention', () => {
  const data = flow.createTrafficIntervention(fresh(), signal({ currentTravelMinutes: 24 }))
  assert.equal(data.liaInterventions.length, 0)
  assert.equal(data.trafficSignals.length, 0)
})

for (const sourceId of ['waze', 'calendar']) test(`${sourceId} ללא LIA access אינו יוצר intervention`, () => {
  const data = fresh()
  const setting = data.families[0].people.find(person => person.id === 'Orel').personalSettings.integrations.find(item => item.sourceId === sourceId)
  setting.liaAccess = 'notAllowed'
  assert.equal(flow.createTrafficIntervention(data, signal()).liaInterventions.length, 0)
})

test('Waze מנותק אינו יוצר intervention גם כשהרשאת LIA מאופשרת', () => {
  const data = fresh()
  const setting = data.families[0].people.find(person => person.id === 'Orel').personalSettings.integrations.find(item => item.sourceId === 'waze')
  setting.connectionStatus = 'disconnected'
  assert.equal(flow.createTrafficIntervention(data, signal()).liaInterventions.length, 0)
})

test('שעת היציאה מחושבת משעת האירוע, זמן הנסיעה ומרווח הביטחון', () => {
  assert.equal(traffic.recommendedDepartureTime('16:00', 31, 5), '15:24')
  const data = flow.createTrafficIntervention(fresh(), signal())
  assert.equal(data.events.find(item => item.id === 'traffic-pickup').departureTime, '16:19')
  assert.match(intervention(data).explanation, /16:19/)
})

test('אני מטפל משאיר את האחריות ומעביר לבטיפול ואז ל-Closure', () => {
  let data = initialized()
  const id = intervention(data).id
  data = flow.applyTrafficFlowAction(data, id, 'takeOwnership', 'Orel')
  assert.equal(intervention(data).status, 'inProgress')
  assert.equal(data.events.find(item => item.id === 'traffic-pickup').responsibleId, 'Orel')
  data = flow.applyTrafficFlowAction(data, id, 'complete', 'Orel')
  assert.equal(intervention(data).status, 'completed')
  assert.equal(intervention(data).resolutionType, 'responsibilityConfirmed')
  assert.match(intervention(data).resolutionSummary, /אוראל/)
})

test('לא יכול פותח handoff במנגנון ההסעות הקיים', () => {
  let data = initializedWithMorAvailable()
  data = flow.applyTrafficFlowAction(data, intervention(data).id, 'cannotDo', 'Orel')
  const item = intervention(data)
  const request = coordination.requestForEvent(data, 'traffic-pickup')
  assert.equal(item.status, 'waiting')
  assert.equal(item.handoffRequestId, request.id)
  assert.notEqual(request.responses.Orel, 'PENDING')
  assert.ok(request.eligibleMemberIds.includes('Mor'))
})

test('handoff candidates משתמשים בכשירות ובדירוג הקיימים', () => {
  let data = initialized()
  data.families[0].people.find(person => person.id === 'Mor').availableForPickup = false
  data = flow.applyTrafficFlowAction(data, intervention(data).id, 'cannotDo', 'Orel')
  assert.ok(!flow.trafficHandoffCandidates(data, intervention(data).id).some(option => option.person.id === 'Mor'))
})

test('candidate מאשר ומעביר אחריות באירוע, coordination ו-Closure', () => {
  let data = initializedWithMorAvailable()
  const id = intervention(data).id
  data = flow.applyTrafficFlowAction(data, id, 'cannotDo', 'Orel')
  data = flow.applyTrafficFlowAction(data, id, 'acceptHandoff', 'Mor')
  assert.equal(data.events.find(item => item.id === 'traffic-pickup').responsibleId, 'Mor')
  assert.equal(coordination.requestForEvent(data, 'traffic-pickup').status, 'COVERED')
  assert.equal(intervention(data).status, 'completed')
  assert.equal(intervention(data).resolutionType, 'responsibilityTransferred')
  assert.match(intervention(data).resolutionSummary, /מור/)
})

test('העברה ישירה משתמשת בכשירות הקיימת, מעדכנת אירוע וסוגרת את ההמלצה', () => {
  let data = initializedWithMorAvailable()
  const id = intervention(data).id
  data = flow.applyTrafficFlowAction(data, id, 'reassign', 'Orel', 'Mor')
  assert.equal(data.events.find(item => item.id === 'traffic-pickup').responsibleId, 'Mor')
  assert.equal(coordination.requestForEvent(data, 'traffic-pickup').status, 'COVERED')
  assert.equal(intervention(data).status, 'completed')
  assert.equal(intervention(data).resolutionType, 'responsibilityTransferred')
})

test('בן משפחה בוגר יכול לאשר את עדכון שעת היציאה ישירות', () => {
  const data = initialized()
  const departureTime = data.events.find(item => item.id === 'traffic-pickup').departureTime
  const result = flow.applyTrafficFlowAction(data, intervention(data).id, 'approve', 'Mor')
  assert.equal(result.events.find(item => item.id === 'traffic-pickup').departureTime, departureTime)
  assert.equal(intervention(result).status, 'completed')
  assert.equal(intervention(result).resolutionType, 'calendarUpdated')
})

test('העברה לנהג לא כשיר אינה משנה מצב', () => {
  const data = initialized()
  const result = flow.applyTrafficFlowAction(data, intervention(data).id, 'reassign', 'Orel', 'Itamar')
  assert.equal(result, data)
})

test('דחיית המלצת תנועה סוגרת אותה ומחזירה את עדכון המסלול', () => {
  const data = initialized()
  const result = flow.applyTrafficFlowAction(data, intervention(data).id, 'dismiss', 'Orel')
  const event = result.events.find(item => item.id === 'traffic-pickup')
  assert.equal(intervention(result).status, 'noAction')
  assert.equal(intervention(result).resolutionType, 'dismissed')
  assert.equal(event.routeMinutes, 18)
  assert.equal(event.sourceNote, undefined)
})

test('candidate מסרב וה-flow אינו נסגר', () => {
  let data = initialized()
  const id = intervention(data).id
  data = flow.applyTrafficFlowAction(data, id, 'cannotDo', 'Orel')
  data = flow.applyTrafficFlowAction(data, id, 'declineHandoff', 'Mor')
  assert.notEqual(intervention(data).status, 'completed')
  assert.equal(intervention(data).resolutionSummary, undefined)
})

test('ללא candidate ה-intervention נשאר פתוח ודורש החלטה', () => {
  let data = initialized()
  data.families[0].people.find(person => person.id === 'Mor').availableForPickup = false
  data = flow.applyTrafficFlowAction(data, intervention(data).id, 'cannotDo', 'Orel')
  assert.equal(intervention(data).status, 'decisionRequired')
  assert.match(intervention(data).statusDetail, /אין כרגע/)
})

test('refresh באמצע pending handoff שומר את המצב ואינו מאתחל את הדמו', () => {
    let data = initializedWithMorAvailable()
  data = flow.applyTrafficFlowAction(data, intervention(data).id, 'cannotDo', 'Orel')
  const storage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try {
    const restored = flow.initializeTrafficCoreFlow(model.readData())
    assert.equal(intervention(restored).status, 'waiting')
    assert.equal(restored.trafficSignals.length, 1)
  } finally { globalThis.localStorage = storage }
})

test('Activity Feed אינו מכפיל שלבים בפעולה חוזרת', () => {
  let data = initialized()
  const id = intervention(data).id
  data = flow.applyTrafficFlowAction(data, id, 'takeOwnership', 'Orel')
  data = flow.applyTrafficFlowAction(data, id, 'takeOwnership', 'Orel')
  assert.equal(data.activity.filter(item => item.id === `activity:${id}:owned:Orel`).length, 1)
})
