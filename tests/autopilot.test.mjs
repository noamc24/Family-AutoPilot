import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const model = await load('src/data.ts')
const coordination = await load('src/coordination.ts')
const autopilot = await load('src/autopilot.ts')
const fresh = () => coordination.ensureRequests(structuredClone(model.initialData), 'maya')

test('אירוע של ילד נכנס ללוח, יוצר בקשת הסעה ונשמר ללא כפילות', () => {
  const first = autopilot.runAutopilotScenario(fresh(), 'cohen', 'basketball', 'automatic')
  assert.equal(first.applied, true)
  const event = first.data.events.find(item => item.title === 'אימון כדורסל')
  assert.equal(event.createdById, 'noa')
  assert.deepEqual(event.participantIds, ['noa'])
  assert.ok(first.data.transportationRequests.some(request => request.eventId === event.id && request.passengerId === 'noa'))
  assert.match(first.message, /עומר הוסיף אירוע חדש/)
  assert.ok(autopilot.scheduleConflicts(first.data, event).some(item => item.id === 'dance'))
  assert.equal(autopilot.runAutopilotScenario(first.data, 'cohen', 'basketball').applied, false)
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(first.data) }
  try { assert.ok(model.readData().events.some(item => item.id === event.id)) } finally { globalThis.localStorage = originalStorage }
})

test('אישור פתרון מזיז אירוע מתנגש ומעדכן בקשת הסעה', () => {
  const data = autopilot.runAutopilotScenario(fresh(), 'cohen', 'basketball').data
  const event = data.events.find(item => item.title === 'אימון כדורסל')
  const solution = autopilot.suggestScheduleSolution(data, event)
  assert.ok(solution)
  const updated = autopilot.applyScheduleSolution(data, event.id)
  const moved = updated.events.find(item => item.id === event.id)
  assert.equal(moved.time, solution.time)
  assert.equal(moved.date, solution.date)
  assert.equal(autopilot.scheduleConflicts(updated, moved).length, 0)
  assert.equal(updated.transportationRequests.find(request => request.eventId === event.id).requiredAt, `${solution.date}T${solution.time}`)
})

test('איחור, שינוי שעת סיום וביטול מעדכנים נתונים אמיתיים', () => {
  let data = autopilot.runAutopilotScenario(fresh(), 'cohen', 'basketball').data
  const late = autopilot.runAutopilotScenario(data, 'cohen', 'late')
  assert.equal(late.applied, true)
  data = late.data
  assert.equal(data.families[0].people.find(person => person.id === 'maya').availability, 'work')
  assert.equal(data.events.find(event => event.id === 'dance').responsibleId, '')
  assert.ok(data.transportationRequests.some(request => request.eventId === 'dance'))
  data = autopilot.runAutopilotScenario(data, 'cohen', 'school-change').data
  assert.equal(data.events.find(event => event.id === 'trip').endTime, '15:00')
  assert.match(data.events.find(event => event.id === 'trip').sourceNote, /מייל מבית הספר/)
  const count = data.events.length
  const cancelled = autopilot.runAutopilotScenario(data, 'cohen', 'cancel')
  assert.equal(cancelled.applied, true)
  assert.equal(cancelled.data.events.length, count - 1)
  assert.equal(autopilot.runAutopilotScenario(cancelled.data, 'cohen', 'cancel').applied, false)
})

test('תרחיש במשפחה אחת אינו משנה תא משפחתי אחר', () => {
  const data = fresh()
  data.families.push({ id: 'levi', name: 'משפחת לוי', people: [{ id: 'kid', name: 'טל', role: 'בן', age: 11, color: 'sage', hasLicense: false, hasCar: false, availableForPickup: false }] })
  const result = autopilot.runAutopilotScenario(data, 'levi', 'friends')
  assert.equal(result.applied, true)
  assert.equal(result.data.events.filter(item => item.familyId === 'cohen').length, data.events.length)
  assert.ok(result.data.events.some(item => item.familyId === 'levi' && item.createdById === 'kid'))
})
