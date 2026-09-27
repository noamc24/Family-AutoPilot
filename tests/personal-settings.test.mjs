import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry, options = {}) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', ...options })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const model = await load('src/data.ts')
const settingsModel = await load('src/personalSettings.ts')
const flow = await load('src/liaCoreFlow.ts')
const fresh = () => structuredClone(model.initialData)
const integration = (person, sourceId) => person.personalSettings.integrations.find(item => item.sourceId === sourceId)
const signal = id => ({ id, familyId: 'Avrahami', source: 'waze', relatedEventId: 'traffic-pickup', previousTravelMinutes: 18, currentTravelMinutes: 31, timestamp: new Date().toISOString(), severity: 'meaningful' })

test('לכל Member יש Connections עצמאיים והחלפה מציגה state שונה', () => {
  const data = fresh()
  const [orel, mor] = data.families[0].people
  orel.personalSettings = settingsModel.updateLiaAccess(settingsModel.updateConnection(orel.personalSettings, 'waze', true), 'waze', true)
  mor.personalSettings = settingsModel.updateLiaAccess(settingsModel.updateConnection(mor.personalSettings, 'waze', true), 'waze', false)
  assert.equal(integration(orel, 'waze').liaAccess, 'allowed')
  assert.equal(integration(mor, 'waze').liaAccess, 'notAllowed')
})

test('connect ו-disconnect משנים רק connectionStatus ושומרים העדפת LIA בנפרד', () => {
  let settings = model.defaultPersonalSettings()
  settings = settingsModel.updateLiaAccess(settings, 'calendar', true)
  settings = settingsModel.updateConnection(settings, 'calendar', true)
  assert.deepEqual(integration({ personalSettings: settings }, 'calendar'), { sourceId: 'calendar', connectionStatus: 'connected', liaAccess: 'allowed', mode: 'demo' })
  settings = settingsModel.updateConnection(settings, 'calendar', false)
  assert.equal(integration({ personalSettings: settings }, 'calendar').connectionStatus, 'disconnected')
  assert.equal(integration({ personalSettings: settings }, 'calendar').liaAccess, 'allowed')
})

test('מקור מנותק או ללא access אינו זמין ל-Traffic Core Flow וחיבור מחדש מחזיר אותו', () => {
  let data = fresh()
  const person = data.families[0].people.find(item => item.id === 'Orel')
  person.personalSettings = settingsModel.updateLiaAccess(person.personalSettings, 'waze', false)
  assert.equal(flow.createTrafficIntervention(data, signal('off')).liaInterventions.length, 0)
  person.personalSettings = settingsModel.updateLiaAccess(person.personalSettings, 'waze', true)
  person.personalSettings = settingsModel.updateConnection(person.personalSettings, 'calendar', false)
  assert.equal(flow.createTrafficIntervention(data, signal('calendar-off')).liaInterventions.length, 0)
  person.personalSettings = settingsModel.updateConnection(person.personalSettings, 'calendar', true)
  const restored = flow.createTrafficIntervention(data, signal('restored'))
  assert.equal(restored.liaInterventions.filter(item => item.type === 'traffic').length, 1)
})

test('Settings נשמרים ב-refresh ונתונים ישנים עוברים migration בטוח', () => {
  const data = fresh()
  const person = data.families[0].people[0]
  person.personalSettings = settingsModel.updateConnection(person.personalSettings, 'email', true)
  const storage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(data) }
  try {
    const restored = model.readData()
    assert.equal(integration(restored.families[0].people[0], 'email').connectionStatus, 'connected')
  } finally { globalThis.localStorage = storage }

  const legacy = fresh()
  delete legacy.families[0].people[0].personalSettings
  const migrated = model.sanitizeAppData(legacy)
  assert.ok(migrated.families[0].people[0].personalSettings.integrations.every(item => item.connectionStatus === 'disconnected' && item.liaAccess === 'notAllowed'))
})

test('Settings מרכז disclosure ב-About ושומר פרטיות בלי לחשוף raw/private source content', async () => {
  const component = await load('src/components/SettingsPage.tsx')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const data = fresh()
  const person = data.families[0].people[0]
  data.integrationLogs.push({ id: 'private', familyId: 'Avrahami', scenarioKey: 'private', source: 'email', sourceText: 'RAW SECRET MESSAGE', action: 'none', personIds: [person.id], createdAt: new Date().toISOString(), privacy: { ownerId: person.id, rawVisibility: 'private', familyInsight: 'תובנה בטוחה' } })
  const html = renderToStaticMarkup(component.SettingsPage({ person, onChange() {}, onEditProfile() {} }))
  assert.doesNotMatch(html, />Demo<|מצב Demo|במצב Demo/)
  assert.match(html, /גרסת MVP/)
  assert.match(html, /מידע אישי נשאר אישי/)
  assert.doesNotMatch(html, /RAW SECRET MESSAGE|תובנה בטוחה/)
  assert.match(html, /הפרופיל, החיבורים וההעדפות של אוראל/)
})
