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

test('קיצורי Presentation נשארים מוסתרים וממופים ל־Ctrl+1/2/3/9', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8')
  assert.match(app, /Digit1' \? 'traffic'/)
  assert.match(app, /Digit2' \? 'wedding'/)
  assert.match(app, /Digit3' \? 'rain'/)
  assert.match(app, /event\.code === 'Digit9'/)
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
    data = shortcuts.runPresentationShortcut(data, 'Avrahami', 'Orel', 'wedding').data
    data = shortcuts.runPresentationShortcut(data, 'Avrahami', 'Orel', 'rain').data
    assert.ok(data.integrationLogs.length >= 3)
    assert.ok(data.events.some(event => event.id.startsWith('presentation-wedding:')))

    const reset = shortcuts.resetPresentationDemo()
    assert.deepEqual(reset.families, model.initialData.families)
    assert.deepEqual(reset.tasks, model.initialData.tasks)
    assert.equal(reset.integrationLogs.length, 0)
    assert.equal(reset.events.some(event => event.id.startsWith('presentation-wedding:')), false)
    assert.equal(reset.externalSignals.length, 0)
    assert.equal(reset.liaConversations.length, 0)
    assert.equal(values.has('family-autopilot-he-v1'), false)
    assert.equal(values.has('family-autopilot-auto-Avrahami'), false)
    assert.equal(values.get('fampilot-production-v1:data'), 'production')
  } finally { globalThis.localStorage = originalStorage }
})
