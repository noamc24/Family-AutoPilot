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
  const first = integrations.simulateIntegration(data, 'Avrahami', 'Orel', 'waze')
  assert.equal(first.applied, true)
  const original = data.events.find(event => event.id === 'football')
  const updated = first.data.events.find(event => event.id === 'football')
  assert.equal(updated.time, original.time)
  assert.equal(updated.departureTime, '15:45')
  assert.equal(updated.routeMinutes, 35)
  assert.match(updated.sourceNote, /וויז/)
  assert.match(first.message, /זיהיתי בוויז/)
  assert.ok(first.data.integrationLogs.some(entry => entry.source === 'waze' && entry.eventId === 'football'))
  const withoutAnotherAssignedRide = { ...first.data, events: first.data.events.filter(event => event.id === 'football' || !event.requiresDriver) }
  const second = integrations.simulateIntegration(withoutAnotherAssignedRide, 'Avrahami', 'Orel', 'waze')
  assert.equal(second.applied, false)
  assert.equal(second.data.events.length, withoutAnotherAssignedRide.events.length)
})

test('הודעת וואטסאפ יוצרת אירוע ביומן המדומה ונמחקת איתו', () => {
  const result = integrations.simulateIntegration(fresh(), 'Avrahami', 'Orel', 'whatsapp')
  assert.equal(result.applied, true)
  const event = result.data.events.find(item => /בדיקת עיניים/.test(item.title))
  assert.ok(event)
  assert.ok(event.participantIds.includes('Itamar'))
  assert.equal(event.responsibleId, 'Orel')
  assert.ok(result.data.calendarMirrors.some(entry => entry.eventId === event.id && entry.personId === 'Orel'))
  const cleaned = domain.removeEventAndDependents(result.data, event.id)
  assert.ok(!cleaned.integrationLogs.some(entry => entry.eventId === event.id))
  assert.ok(!cleaned.calendarMirrors.some(entry => entry.eventId === event.id))
})

test('בית הספר מעדכן טיול ויוצר משימה; אוניברסיטה יוצרת אירוע נפרד', () => {
  let data = integrations.simulateIntegration(fresh(), 'Avrahami', 'Mor', 'school').data
  assert.equal(data.events.find(event => event.id === 'trip').time, '09:00')
  assert.ok(data.tasks.some(task => task.eventId === 'trip' && /אישור חתום/.test(task.title) && task.ownerId === 'Mor'))
  const count = data.events.length
  const university = data.families[0].people.find(person => person.id === 'Mor').personalSettings.integrations.find(item => item.sourceId === 'university')
  Object.assign(university, { connectionStatus: 'connected', liaAccess: 'allowed' })
  data = integrations.simulateIntegration(data, 'Avrahami', 'Mor', 'university').data
  assert.equal(data.events.length, count + 1)
  const event = data.events.find(item => item.title === 'הרצאה באוניברסיטה')
  assert.ok(data.calendarMirrors.some(mirror => mirror.eventId === event.id && mirror.personId === 'Mor'))
  assert.match(data.events.find(item => item.id === 'trip').sourceNote, /מייל מבית הספר/)
  assert.match(event.sourceNote, /מייל ממערכת האוניברסיטה/)
})

test('מקור המידע נשמר באירוע גם אחרי טעינה מחדש', () => {
  const data = integrations.simulateIntegration(fresh(), 'Avrahami', 'Orel', 'whatsapp').data
  const event = data.events.find(item => /בדיקת עיניים/.test(item.title))
  assert.match(event.sourceNote, /וואטסאפ/)
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try { assert.equal(model.readData().events.find(item => item.id === event.id).sourceNote, event.sourceNote) }
  finally { globalThis.localStorage = previousStorage }
})

test('נתונים ישנים מקבלים ציון מקור ללא טקסט טכני', () => {
  const data = integrations.simulateIntegration(fresh(), 'Avrahami', 'Orel', 'whatsapp').data
  const event = data.events.find(item => /בדיקת עיניים/.test(item.title))
  delete event.sourceNote
  event.details = 'תואם בוואטסאפ · נוסף ליומן גוגל המדומה'
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try {
    const restored = model.readData().events.find(item => item.id === event.id)
    assert.match(restored.sourceNote, /וואטסאפ/)
    assert.doesNotMatch(restored.details, /מדומה/)
  } finally { globalThis.localStorage = previousStorage }
})

test('זיהוי טקסט מפנה למקור המדומה הנכון', () => {
  assert.equal(integrations.detectIntegrationScenario('זוהה פקק בוויז בדרך לאימון'), 'waze')
  assert.equal(integrations.detectIntegrationScenario('אשתי כתבה בוואטסאפ על תור'), 'whatsapp')
  assert.equal(integrations.detectIntegrationScenario('הודעה מבית הספר על טיול'), 'school')
  assert.equal(integrations.detectIntegrationScenario('עדכון מהאוניברסיטה'), 'university')
})

test('מחיקת בן משפחה מנקה רישומי אינטגרציה תלויים', () => {
  const data = integrations.simulateIntegration(fresh(), 'Avrahami', 'Orel', 'whatsapp').data
  const cleaned = model.removePersonAndTheirData(data, 'Avrahami', 'Itamar')
  assert.equal(cleaned.integrationLogs.length, 0)
  assert.equal(cleaned.calendarMirrors.length, 0)
})

test('עדכוני ההדמיה ויומן גוגל המדומה נשמרים בטעינה מחדש', () => {
  const data = integrations.simulateIntegration(fresh(), 'Avrahami', 'Orel', 'whatsapp').data
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
  const settings = model.defaultPersonalSettings()
  Object.assign(settings.integrations.find(item => item.sourceId === 'university'), { connectionStatus: 'connected', liaAccess: 'allowed' })
  data.families.push({ id: 'levi', name: 'משפחת לוי', people: [{ id: 'lee', name: 'לי', role: 'אם', color: 'sage', age: 35, hasLicense: true, hasCar: true, availableForPickup: true, personalSettings: settings }] })
  const result = integrations.simulateIntegration(data, 'levi', 'lee', 'university')
  assert.equal(result.applied, true)
  assert.ok(result.data.events.some(event => event.familyId === 'levi' && event.title === 'הרצאה באוניברסיטה'))
  assert.equal(result.data.events.filter(event => event.familyId === 'Avrahami').length, data.events.length)
  assert.ok(result.data.integrationLogs.every(entry => entry.familyId === 'levi'))
})

test('עדכונים אוטומטיים מופעלים אחד בכל פעם ואינם יוצרים כפילות', () => {
  const first = integrations.advanceAutomaticIntegrations(fresh(), 'Avrahami', 'Orel')
  assert.equal(first.applied, true)
  assert.equal(first.data.integrationLogs[0].source, 'waze')
  assert.equal(first.data.integrationLogs[0].trigger, 'automatic')
  const second = integrations.advanceAutomaticIntegrations(first.data, 'Avrahami', 'Orel')
  assert.equal(second.applied, true)
  assert.equal(second.data.integrationLogs[0].source, 'waze')
  assert.notEqual(second.data.integrationLogs[0].eventId, second.data.integrationLogs[1].eventId)
  assert.equal(second.data.integrationLogs.filter(item => item.source === 'waze').length, 2)
  const third = integrations.advanceAutomaticIntegrations(second.data, 'Avrahami', 'Orel')
  assert.equal(third.applied, true)
  assert.equal(third.data.integrationLogs[0].source, 'school')
})

test('נתונים ישנים מקבלים הגדרות אישיות וחיבורי דמו ברירת מחדל בטוחה', () => {
  const legacy = fresh()
  delete legacy.families[0].people[0].personalSettings
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(legacy) }
  try {
    const person = model.readData().families[0].people[0]
    assert.equal(person.personalSettings.integrations.length, model.personalSourceIds.length)
    assert.ok(person.personalSettings.integrations.every(item => item.mode === 'demo'))
    assert.ok(person.personalSettings.integrations.every(item => item.connectionStatus === 'connected' && item.liaAccess === 'allowed'))
  } finally { globalThis.localStorage = originalStorage }
})

test('עדכון ממקור שומר תוכן פרטי בנפרד מתובנה משפחתית', () => {
  const result = integrations.simulateIntegration(fresh(), 'Avrahami', 'Orel', 'whatsapp')
  const log = result.data.integrationLogs[0]
  assert.equal(log.privacy.rawVisibility, 'private')
  assert.ok(log.sourceText.includes('וואטסאפ'))
  assert.match(log.privacy.familyInsight, /LIA/)
  assert.doesNotMatch(log.privacy.familyInsight, /קבענו.*מחר/)
})
