import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const model = await load('src/data.ts')
const domain = await load('src/domain.ts')
const integrations = await load('src/integrations.ts')
const fresh = () => structuredClone(model.initialData)

test('פקק מדומה משנה שעת יציאה אך לא את שעת האירוע ונמנע מכפילות', () => {
  const data = fresh()
  const first = integrations.simulateIntegration(data, 'cohen', 'adam', 'waze')
  assert.equal(first.applied, true)
  const original = data.events.find(event => event.id === 'football')
  const updated = first.data.events.find(event => event.id === 'football')
  assert.equal(updated.time, original.time)
  assert.equal(updated.departureTime, '16:15')
  assert.equal(updated.routeMinutes, 35)
  assert.match(updated.details, /וויז/)
  assert.ok(first.data.integrationLogs.some(entry => entry.source === 'waze' && entry.eventId === 'football'))
  const second = integrations.simulateIntegration(first.data, 'cohen', 'adam', 'waze')
  assert.equal(second.applied, false)
  assert.equal(second.data.events.length, first.data.events.length)
})

test('הודעת וואטסאפ יוצרת אירוע ביומן המדומה ונמחקת איתו', () => {
  const result = integrations.simulateIntegration(fresh(), 'cohen', 'adam', 'whatsapp')
  assert.equal(result.applied, true)
  const event = result.data.events.find(item => /בדיקת עיניים/.test(item.title))
  assert.ok(event)
  assert.ok(event.participantIds.includes('yuval'))
  assert.equal(event.responsibleId, 'adam')
  assert.ok(result.data.calendarMirrors.some(entry => entry.eventId === event.id && entry.personId === 'adam'))
  const cleaned = domain.removeEventAndDependents(result.data, event.id)
  assert.ok(!cleaned.integrationLogs.some(entry => entry.eventId === event.id))
  assert.ok(!cleaned.calendarMirrors.some(entry => entry.eventId === event.id))
})

test('בית הספר מעדכן טיול ויוצר משימה; אוניברסיטה יוצרת אירוע נפרד', () => {
  let data = integrations.simulateIntegration(fresh(), 'cohen', 'maya', 'school').data
  assert.equal(data.events.find(event => event.id === 'trip').time, '09:00')
  assert.ok(data.tasks.some(task => task.eventId === 'trip' && /אישור חתום/.test(task.title) && task.ownerId === 'maya'))
  const count = data.events.length
  data = integrations.simulateIntegration(data, 'cohen', 'maya', 'university').data
  assert.equal(data.events.length, count + 1)
  const event = data.events.find(item => item.title === 'הרצאה באוניברסיטה')
  assert.ok(data.calendarMirrors.some(mirror => mirror.eventId === event.id && mirror.personId === 'maya'))
})

test('זיהוי טקסט מפנה למקור המדומה הנכון', () => {
  assert.equal(integrations.detectIntegrationScenario('זוהה פקק בוויז בדרך לאימון'), 'waze')
  assert.equal(integrations.detectIntegrationScenario('אשתי כתבה בוואטסאפ על תור'), 'whatsapp')
  assert.equal(integrations.detectIntegrationScenario('הודעה מבית הספר על טיול'), 'school')
  assert.equal(integrations.detectIntegrationScenario('עדכון מהאוניברסיטה'), 'university')
})

test('מחיקת בן משפחה מנקה רישומי אינטגרציה תלויים', () => {
  const data = integrations.simulateIntegration(fresh(), 'cohen', 'adam', 'whatsapp').data
  const cleaned = model.removePersonAndTheirData(data, 'cohen', 'yuval')
  assert.equal(cleaned.integrationLogs.length, 0)
  assert.equal(cleaned.calendarMirrors.length, 0)
})

test('עדכוני ההדמיה ויומן גוגל המדומה נשמרים בטעינה מחדש', () => {
  const data = integrations.simulateIntegration(fresh(), 'cohen', 'adam', 'whatsapp').data
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try {
    const restored = model.readData()
    assert.equal(restored.integrationLogs.length, 1)
    assert.equal(restored.calendarMirrors.length, 1)
    assert.ok(restored.events.some(event => event.id === restored.calendarMirrors[0].eventId))
  } finally { globalThis.localStorage = originalStorage }
})

test('הדמיית מקור משפיעה רק על התא המשפחתי הפעיל', () => {
  const data = fresh()
  data.families.push({ id: 'levi', name: 'משפחת לוי', people: [{ id: 'lee', name: 'לי', role: 'אם', color: 'sage', age: 35, hasLicense: true, hasCar: true, availableForPickup: true }] })
  const result = integrations.simulateIntegration(data, 'levi', 'lee', 'university')
  assert.equal(result.applied, true)
  assert.ok(result.data.events.some(event => event.familyId === 'levi' && event.title === 'הרצאה באוניברסיטה'))
  assert.equal(result.data.events.filter(event => event.familyId === 'cohen').length, data.events.length)
  assert.ok(result.data.integrationLogs.every(entry => entry.familyId === 'levi'))
})

test('עדכונים אוטומטיים מופעלים אחד בכל פעם ואינם יוצרים כפילות', () => {
  const first = integrations.advanceAutomaticIntegrations(fresh(), 'cohen', 'adam')
  assert.equal(first.applied, true)
  assert.equal(first.data.integrationLogs[0].source, 'waze')
  assert.equal(first.data.integrationLogs[0].trigger, 'automatic')
  const second = integrations.advanceAutomaticIntegrations(first.data, 'cohen', 'adam')
  assert.equal(second.applied, true)
  assert.equal(second.data.integrationLogs[0].source, 'school')
  assert.equal(second.data.integrationLogs.filter(item => item.source === 'waze').length, 1)
})
