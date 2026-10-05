import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const dataModule = await load('src/data.ts')
const coordination = await load('src/coordination.ts')
const domain = await load('src/domain.ts')
const fresh = () => coordination.ensureRequests(structuredClone(dataModule.initialData), 'Mor')

test('בקשת הסעה נשלחת לנהגים כשירים בלבד והתשובות משותפות', () => {
  let data = fresh()
  const request = coordination.requestForEvent(data, 'pickup')
  assert.ok(request)
  assert.deepEqual(request.eligibleMemberIds.sort(), ['Mor', 'Orel'])
  assert.equal(request.responses.Itamar, undefined)
  data = coordination.respondToRequest(data, request.id, 'noa', 'CAN_DO')
  assert.equal(coordination.requestForEvent(data, 'pickup').responses.noa, undefined)
  data = coordination.respondToRequest(data, request.id, 'Orel', 'CAN_DO')
  assert.equal(coordination.requestForEvent(data, 'pickup').status, 'PARTIALLY_RESPONDED')
  assert.equal(coordination.recommendDriver(data, coordination.requestForEvent(data, 'pickup')).person.id, 'Orel')
  data = coordination.confirmDriver(data, request.id, 'Orel')
  assert.equal(coordination.requestForEvent(data, 'pickup').status, 'COVERED')
  assert.equal(data.events.find(event => event.id === 'pickup').responsibleId, 'Orel')
  data = coordination.respondToRequest(data, request.id, 'Orel', 'CANNOT_DO')
  assert.equal(data.events.find(event => event.id === 'pickup').responsibleId, '')
})

test('סירוב של כולם יוצר מצב ללא פתרון וחלופה דורשת תשובה חדשה', () => {
  let data = fresh()
  const id = coordination.requestForEvent(data, 'pickup').id
  data = coordination.respondToRequest(data, id, 'Orel', 'CANNOT_DO')
  data = coordination.respondToRequest(data, id, 'Mor', 'CANNOT_DO')
  const request = data.transportationRequests.find(item => item.id === id)
  assert.equal(request.status, 'UNRESOLVED')
  assert.equal(coordination.recommendDriver(data, request), null)
  assert.ok(coordination.alternativeForRequest(data, request))
  const next = coordination.applyAlternativePlan(data, id)
  assert.equal(next.transportationRequests.find(item => item.id === id).selectedDriverId, '')
  assert.equal(next.transportationRequests.find(item => item.id === id).responses.Orel, 'PENDING')
})

test('העברת בקשת הסעה שולחת אותה לכל הנמענים הכשירים שנבחרו', () => {
  let data = fresh()
  const request = coordination.requestForEvent(data, 'pickup')
  data = coordination.forwardRequest(data, request.id, 'Mor', ['Orel', 'Itamar'])
  const forwarded = coordination.requestForEvent(data, 'pickup')
  assert.equal(forwarded.responses.Mor, 'CANNOT_DO')
  assert.equal(forwarded.responses.Orel, 'PENDING')
  assert.equal(forwarded.responses.Itamar, undefined)
  assert.notEqual(forwarded.status, 'COVERED')
})

test('תפקיד בן בוגר אינו חוסם נהיגה, וזמינות מבטלת שיבוץ', () => {
  let data = fresh()
  const adultSon = { id: 'grown-son', name: 'עידו', role: 'בן', age: 22, hasLicense: true, hasCar: true, availableForPickup: true, color: 'sage' }
  data.families[0].people.push(adultSon)
  data = coordination.reconcileTransportation(data)
  assert.ok(coordination.requestForEvent(data, 'pickup').eligibleMemberIds.includes(adultSon.id))
  const id = coordination.requestForEvent(data, 'pickup').id
  data = coordination.respondToRequest(data, id, 'Orel', 'CAN_DO')
  data = coordination.confirmDriver(data, id, 'Orel')
  data.families[0].people.find(person => person.id === 'Orel').availability = 'unavailable'
  data = coordination.reconcileTransportation(data)
  assert.equal(data.events.find(event => event.id === 'pickup').responsibleId, '')
  assert.ok(!coordination.requestForEvent(data, 'pickup').eligibleMemberIds.includes('Orel'))
})

test('מחיקת אירוע או אדם מנקה את הבקשות התלויות', () => {
  const data = fresh()
  assert.equal(domain.removeEventAndDependents(data, 'pickup').transportationRequests.length, 0)
  assert.equal(dataModule.removePersonAndTheirData(data, 'Avrahami', 'Itamar').transportationRequests.length, 0)
})

test('תרחיש איחור משנה זמינות, דוחה קניות ופותח בקשה חדשה', () => {
  const data = fresh()
  const family = data.families[0]
  const impact = domain.getLateImpact(data, family, 'Mor')
  assert.equal(impact.pickup.id, 'dance')
  const next = coordination.ensureRequests(domain.applyLatePlan(data, family, 'Mor', impact), 'Mor')
  assert.equal(next.families[0].people.find(person => person.id === 'Mor').availability, 'work')
  assert.equal(next.events.find(event => event.id === 'dance').responsibleId, '')
  assert.equal(next.tasks.find(task => task.id === 'groceries').due, dataModule.localDate(1))
  assert.ok(coordination.requestForEvent(next, 'dance'))
  assert.ok(!coordination.requestForEvent(next, 'dance').eligibleMemberIds.includes('Mor'))
})

test('תכנון יום הולדת בחמישי יוצר אירוע ומשימה ובקשת הסעה בלי לשבץ נהג', () => {
  const data = fresh()
  const family = data.families[0]
  const plan = domain.prepareBirthdayPlan(data, family, 'Mor', 'ליובל יש יום הולדת אצל דניאל בחמישי בחמש וצריך להביא עוגה')
  assert.equal(plan.title, 'יום ההולדת של דניאל')
  assert.equal(plan.time, '17:00')
  const next = coordination.ensureRequests(domain.applyBirthdayPlan(data, family, 'Mor', plan), 'Mor')
  const event = next.events.find(item => item.title === plan.title)
  assert.ok(event)
  assert.equal(event.responsibleId, '')
  assert.equal(coordination.requestForEvent(next, event.id).passengerId, 'Itamar')
  assert.ok(next.tasks.some(task => task.eventId === event.id && /עוג/.test(task.title)))
})

test('נתונים ישנים נטענים ללא אובדן אירועים ועם תפקידי משפחה מוגדרים', () => {
  const legacy = structuredClone(dataModule.initialData)
  legacy.events.forEach((event, index) => { event.date = dataModule.localDate(index + 1) })
  delete legacy.transportationRequests
  legacy.families[0].people[0].role = 'אמא'
  legacy.families[0].people[1].role = 'אבא'
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(legacy) }
  try {
    const migrated = coordination.ensureRequests(dataModule.readData(), 'Mor')
    assert.equal(migrated.families[0].people[0].role, 'אם')
    assert.equal(migrated.families[0].people[1].role, 'אב')
    assert.equal(migrated.events.length, legacy.events.length)
    assert.ok(coordination.requestForEvent(migrated, 'pickup'))
  } finally { globalThis.localStorage = originalStorage }
})
