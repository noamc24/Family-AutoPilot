import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const model = await load('src/data.ts')
const coordination = await load('src/coordination.ts')
const domain = await load('src/domain.ts')
const integrations = await load('src/integrationScenarios.ts')
const forecast = await load('src/forecast.ts')
const fresh = () => structuredClone(model.initialData)

test('תרחיש ההחלטה מדרג שני נהגים לפי עומס ומרחק ומציג את הסיבות האמיתיות', () => {
  const result = integrations.runExternalScenario(fresh(), 'cohen', 'maya', 'decision-demo')
  assert.equal(result.applied, true)
  const event = result.data.events.find(item => item.sourceNote === 'זמני הגעה עודכנו בוויז')
  const request = coordination.requestForEvent(result.data, event.id)
  const options = coordination.rankedDrivers(result.data, request)
  assert.equal(options.length, 2)
  assert.equal(options[0].person.id, 'adam')
  assert.match(options[0].reason, /13 דקות/)
  assert.match(options[0].reason, /0 הסעות/)
  assert.match(options[1].reason, /8 דקות/)
  assert.match(options[1].reason, /2 הסעות/)
  const approved = coordination.confirmDriver(result.data, request.id, options[0].person.id)
  assert.equal(approved.events.find(item => item.id === event.id).responsibleId, 'adam')
  assert.equal(integrations.runExternalScenario(approved, 'cohen', 'maya', 'decision-demo').applied, false)
})

test('מגבלות נהיגה הן חובה והעדפה לנהג אינה עוקפת אותן', () => {
  let data = fresh()
  data.events = [{ id: 'ride', familyId: 'cohen', title: 'אימון', date: model.localDate(1), time: '18:00', icon: '🚗', participantIds: ['noa'], responsibleId: '', requiresDriver: true, details: '', preferredDriverId: 'maya' }]
  data.families[0].people.find(person => person.id === 'maya').unavailableFrom = '17:00'
  data.families[0].people.find(person => person.id === 'maya').unavailableTo = '21:00'
  data = coordination.ensureRequests(data, 'noa')
  const request = coordination.requestForEvent(data, 'ride')
  assert.deepEqual(request.eligibleMemberIds, ['adam'])
  assert.equal(domain.pickupIneligibility(data.families[0].people.find(person => person.id === 'maya'), data.events[0], data), 'לא זמין/ה בשעות האלה בדרך כלל')
  data.families[0].people.find(person => person.id === 'adam').activeDriver = false
  data = coordination.ensureRequests(data, 'noa')
  assert.equal(coordination.recommendDriver(data, coordination.requestForEvent(data, 'ride')), null)
  assert.equal(coordination.requestForEvent(data, 'ride').status, 'UNRESOLVED')
})

test('תחבורה ציבורית מוצעת רק עם אישור המשפחה והרשאה אישית', () => {
  let data = fresh()
  data.events = [{ id: 'ride', familyId: 'cohen', title: 'אימון', date: model.localDate(1), time: '18:00', icon: '🚗', participantIds: ['yuval'], responsibleId: '', requiresDriver: true, transitAvailable: true, details: '' }]
  data = coordination.ensureRequests(data, 'yuval')
  const request = coordination.requestForEvent(data, 'ride')
  assert.equal(coordination.transitAlternative(data, request), null)
  data.families[0].preferences = { allowPublicTransit: true }
  const child = data.families[0].people.find(person => person.id === 'yuval')
  child.canUseTransit = true
  child.canTravelAlone = true
  assert.equal(coordination.transitAlternative(data, request), null)
  child.age = 12
  assert.ok(coordination.transitAlternative(data, request))
  const next = coordination.applyTransitAlternative(data, request.id)
  assert.equal(next.events[0].requiresDriver, false)
  assert.equal(coordination.requestForEvent(next, 'ride'), undefined)
})

test('אירוע קריטי ומשימה שאינה גמישה אינם מוזזים אוטומטית; ההעדפות נשמרות ברענון', () => {
  const data = fresh()
  data.families[0].preferences = { balanceRides: true, moveFlexibleTasks: false }
  data.families[0].people.find(person => person.id === 'maya').preferredMaxRides = 2
  data.events = [{ id: 'critical', familyId: 'cohen', title: 'רופא', date: model.localDate(1), time: '17:00', icon: '🦷', participantIds: ['maya'], responsibleId: '', details: '', priority: 'critical' }]
  const risk = { id: 'overlap:critical:x', kind: 'overlap', eventId: 'critical', date: model.localDate(1), time: '17:00', title: '', detail: '' }
  assert.equal(forecast.suggestForecastSolution(data, risk), null)
  const storage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try {
    const restored = model.readData()
    assert.equal(restored.families[0].preferences.moveFlexibleTasks, false)
    assert.equal(restored.families[0].people.find(person => person.id === 'maya').preferredMaxRides, 2)
    assert.equal(restored.events[0].priority, 'critical')
  } finally { globalThis.localStorage = storage }
})
