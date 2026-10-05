import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: "import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import App from './src/App.tsx'; import { initialData } from './src/data.ts'; export const seed = initialData; export const render = () => renderToStaticMarkup(React.createElement(App));",
    resolveDir: process.cwd(), sourcefile: 'render-entry.tsx', loader: 'tsx',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const render = module.exports.render
const seed = module.exports.seed

const storageMock = values => ({
  getItem: key => values[key] ?? null,
  setItem: (key, value) => { values[key] = String(value) },
  removeItem: key => { delete values[key] },
  clear: () => { Object.keys(values).forEach(key => delete values[key]) },
})

test('מסך הבית משתנה בין הורה לילד ומציג תוכן מותאם', () => {
  const originalStorage = globalThis.localStorage
  let person = 'Mor'
  const values = {
    'fampilot-production-v1:data': JSON.stringify(seed),
    'fampilot-production-v1:person-selection': person,
  }
  globalThis.localStorage = storageMock(values)
  try {
    const parent = render()
    assert.match(parent, /(?:בוקר טוב|צהריים טובים|אחה״צ טובים|ערב טוב|לילה טוב) מור|לכי לישון/)
    assert.match(parent, /הכול שקט כרגע/)
    assert.doesNotMatch(parent, /עדכונים ממקורות/)
    person = 'Orel'
    values['fampilot-production-v1:person-selection'] = person
    const otherParent = render()
    assert.match(otherParent, /(?:בוקר טוב|צהריים טובים|אחה״צ טובים|ערב טוב|לילה טוב) אוראל|לך לישון/)
    assert.notEqual(otherParent, parent)
    person = 'Itamar'
    values['fampilot-production-v1:person-selection'] = person
    const child = render()
    assert.match(child, /שלום, איתמר/)
    assert.match(child, /בשבילך היום/)
    assert.match(child, /ההסעות שלי/)
    assert.match(child, /המשימות שלי/)
    assert.match(child, /הוספת אירוע/)
    assert.doesNotMatch(child, /בקשות הסעה במשפחה/)
    assert.doesNotMatch(child, /עדכונים ממקורות/)
    assert.doesNotMatch(child, /LIA כבר טיפלה/)
  } finally { globalThis.localStorage = originalStorage }
})

test('כרטיס מצב משפחתי תקין מציג רק נתונים קיימים', () => {
  const originalStorage = globalThis.localStorage
  const family = { id: 'quiet', name: 'משפחה שקטה', people: [{ id: 'parent', name: 'הורה', role: 'אב', color: 'sage', age: 35, hasLicense: true, hasCar: true, availableForPickup: true }] }
  const saved = { families: [family], events: [], tasks: [], activity: [], transportationRequests: [], integrationLogs: [], calendarMirrors: [] }
  globalThis.localStorage = storageMock({
    'fampilot-production-v1:data': JSON.stringify(saved),
    'fampilot-production-v1:family-selection': 'quiet',
    'fampilot-production-v1:person-selection': 'parent',
  })
  try {
    const markup = render()
    assert.match(markup, /התוכנית המשפחתית עדיין פנויה/)
    assert.equal((markup.match(/התוכנית המשפחתית עדיין פנויה/g) ?? []).length, 1)
    assert.doesNotMatch(markup, /0 אירועים היום|אין נושאים פתוחים/)
  } finally { globalThis.localStorage = originalStorage }
})
