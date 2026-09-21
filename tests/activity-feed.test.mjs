import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const model = await load('src/data.ts')
const coordination = await load('src/coordination.ts')
const feed = await load('src/activityFeed.ts')

test('פתיחת בקשה נרשמת פעם אחת ונשמרת אחרי טעינה מחדש', () => {
  const first = coordination.ensureRequests(structuredClone(model.initialData), 'adam')
  const second = coordination.ensureRequests(first, 'adam')
  assert.equal(second.activity.filter(item => item.text.includes('נפתחה בקשת הסעה')).length, 1)
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(second) }
  try {
    const restored = coordination.ensureRequests(model.readData(), 'adam')
    assert.equal(restored.activity.filter(item => item.text.includes('נפתחה בקשת הסעה')).length, 1)
    assert.ok(feed.activityFeed(restored, 'cohen').some(item => item.text.includes('נפתחה בקשת הסעה')))
  } finally { globalThis.localStorage = originalStorage }
})

test('הרשומות מסודרות לפי זמן ומופרדות בין משפחות ללא כפילות של מקור', () => {
  const data = structuredClone(model.initialData)
  const day = model.localDate()
  const at = time => new Date(`${day}T${time}:00`).toISOString()
  data.families.push({ id: 'other', name: 'משפחה אחרת', people: [] })
  data.activity = [
    { id: 'old', familyId: 'cohen', text: 'רשומה ישנה', personIds: [] },
    { id: 'action', familyId: 'cohen', text: 'נוסף אירוע', personIds: ['adam'], createdAt: at('16:02') },
    { id: 'duplicate', familyId: 'cohen', text: 'זוהה עומס', personIds: ['adam'], createdAt: at('16:04') },
    { id: 'other', familyId: 'other', text: 'עדכון אחר', personIds: [], createdAt: at('16:05') },
  ]
  data.integrationLogs = [{ id: 'waze', familyId: 'cohen', scenarioKey: 'traffic', source: 'waze', sourceText: 'עומס', action: 'זוהה עומס', personIds: ['adam'], createdAt: at('16:04') }]
  const entries = feed.activityFeed(data, 'cohen', day)
  assert.deepEqual(entries.map(item => item.text), ['זוהה עומס', 'נוסף אירוע'])
  assert.equal(entries[0].source, 'waze')
  assert.equal(feed.activityFeed(data, 'other', day).length, 1)
  assert.equal(feed.activityFeed(data, 'cohen', day, 1).length, 1)
})
