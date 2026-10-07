import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import fs from 'node:fs'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const model = await load('src/data.ts')
const shortcuts = await load('src/presentationShortcuts.ts')

test('קיצורי Presentation נשארים מוסתרים וממופים ל־Ctrl+1/2/3/4/9', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8')
  assert.match(app, /Digit1' \? 'traffic'/)
  assert.match(app, /Digit2' \? 'whatsapp'/)
  assert.match(app, /Digit3' \? 'weather'/)
  assert.match(app, /Digit4' \? 'family'/)
  assert.match(app, /event\.code === 'Digit9'/)
})

test('קיצורי התרחישים מייצרים וריאציות בתחום הנכון בלי לחרוג מטווחי המצגת', () => {
  let data = structuredClone(model.initialData)
  const traffic = shortcuts.runPresentationShortcut(data, 'Avrahami', 'Orel', 'traffic')
  assert.equal(traffic.applied, true)
  const afterTraffic = traffic.data.events.find(event => event.sourceNote === 'זוהה שינוי בזמן הנסיעה בוויז')
  assert.ok(afterTraffic)
  assert.match(traffic.message, /(?:התארך|התקצר) ב־(?:[4-9]|1[0-7]) דקות/)

  const whatsapp = shortcuts.runPresentationShortcut(traffic.data, 'Avrahami', 'Orel', 'whatsapp')
  assert.equal(whatsapp.applied, true)
  const whatsappEvent = whatsapp.data.events.find(event => event.id.startsWith('presentation-whatsapp:'))
  assert.ok(whatsappEvent)
  assert.ok(whatsapp.data.calendarMirrors.some(item => item.eventId === whatsappEvent.id))

  const weather = shortcuts.runPresentationShortcut(whatsapp.data, 'Avrahami', 'Orel', 'weather')
  assert.equal(weather.applied, true)
  assert.match(weather.message, /גשם כבד|שרב קיצוני|שלג|רוחות חזקות/)

  const family = shortcuts.runPresentationShortcut(weather.data, 'Avrahami', 'Orel', 'family')
  assert.equal(family.applied, true)
  assert.ok(family.data.events.some(event => event.id.startsWith('presentation-family:')))
  assert.match(family.message, /עדכן\/ה/)
})

test('Ctrl+9 seed reset מוחק רק Presentation storage ומסיר את תוצרי התרחישים', () => {
  const values = new Map([
    ['family-autopilot-he-v1', 'changed'],
    ['family-autopilot-auto-Avrahami', 'changed'],
    ['fampilot-production-v1:data', 'production'],
  ])
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = {
    get length() { return values.size },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
  try {
    let data = structuredClone(model.initialData)
    data = shortcuts.runPresentationShortcut(data, 'Avrahami', 'Orel', 'traffic').data
    data = shortcuts.runPresentationShortcut(data, 'Avrahami', 'Orel', 'whatsapp').data
    data = shortcuts.runPresentationShortcut(data, 'Avrahami', 'Orel', 'weather').data
    data = shortcuts.runPresentationShortcut(data, 'Avrahami', 'Orel', 'family').data
    assert.ok(data.integrationLogs.length >= 4)
    assert.ok(data.events.some(event => event.id.startsWith('presentation-whatsapp:')))

    const reset = shortcuts.resetPresentationDemo()
    assert.deepEqual(reset.families, model.initialData.families)
    assert.deepEqual(reset.tasks, model.initialData.tasks)
    assert.equal(reset.integrationLogs.length, 0)
    assert.equal(reset.events.some(event => event.id.startsWith('presentation-whatsapp:')), false)
    assert.equal(reset.externalSignals.length, 0)
    assert.equal(reset.liaConversations.length, 0)
    assert.equal(values.has('family-autopilot-he-v1'), false)
    assert.equal(values.has('family-autopilot-auto-Avrahami'), false)
    assert.equal(values.get('fampilot-production-v1:data'), 'production')
  } finally { globalThis.localStorage = originalStorage }
})
