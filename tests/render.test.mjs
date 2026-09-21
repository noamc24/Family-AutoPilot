import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: "import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import App from './src/App.tsx'; export const render = () => renderToStaticMarkup(React.createElement(App));",
    resolveDir: process.cwd(), sourcefile: 'render-entry.tsx', loader: 'tsx',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const render = module.exports.render

test('מסך הבית משתנה בין הורה לילד ומציג תוכן מותאם', () => {
  const originalStorage = globalThis.localStorage
  let person = 'maya'
  globalThis.localStorage = { getItem: key => key === 'family-autopilot-person' ? person : null }
  try {
    const parent = render()
    assert.match(parent, /שלום מור/)
    assert.match(parent, /צריך את תשומת הלב שלך/)
    assert.match(parent, /בקשות הסעה במשפחה/)
    assert.match(parent, /המשפחה היום/)
    assert.match(parent, /עדכונים ממקורות/)
    assert.match(parent, /מה קרה היום/)
    assert.match(parent, /וויז/)
    person = 'adam'
    const otherParent = render()
    assert.match(otherParent, /שלום אוראל/)
    assert.notEqual(otherParent, parent)
    person = 'yuval'
    const child = render()
    assert.match(child, /שלום, איתמר/)
    assert.match(child, /בשבילך היום/)
    assert.match(child, /ההסעות שלי/)
    assert.match(child, /המשימות שלי/)
    assert.match(child, /הוספת אירוע/)
    assert.doesNotMatch(child, /בקשות הסעה במשפחה/)
    assert.doesNotMatch(child, /עדכונים ממקורות/)
  } finally { globalThis.localStorage = originalStorage }
})

test('כרטיס מצב משפחתי תקין מציג רק נתונים קיימים', () => {
  const originalStorage = globalThis.localStorage
  const family = { id: 'quiet', name: 'משפחה שקטה', people: [{ id: 'parent', name: 'הורה', role: 'אב', color: 'sage', age: 35, hasLicense: true, hasCar: true, availableForPickup: true }] }
  const saved = { families: [family], events: [], tasks: [], activity: [], transportationRequests: [], integrationLogs: [], calendarMirrors: [] }
  globalThis.localStorage = { getItem: key => key === 'family-autopilot-he-v1' ? JSON.stringify(saved) : key === 'family-autopilot-family' ? 'quiet' : key === 'family-autopilot-person' ? 'parent' : null }
  try {
    const markup = render()
    assert.match(markup, /הכל בשליטה/)
    assert.match(markup, /0 אירועים היום/)
    assert.match(markup, /0 הסעות/)
    assert.match(markup, /אין בעיות פתוחות/)
  } finally { globalThis.localStorage = originalStorage }
})
