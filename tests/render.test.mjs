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
    assert.match(parent, /שלום מאיה/)
    assert.match(parent, /בקשות הסעה במשפחה/)
    assert.match(parent, /המשפחה היום/)
    assert.match(parent, /עדכונים ממקורות/)
    assert.match(parent, /וויז/)
    person = 'adam'
    const otherParent = render()
    assert.match(otherParent, /שלום אדם/)
    assert.notEqual(otherParent, parent)
    person = 'yuval'
    const child = render()
    assert.match(child, /שלום, יובל/)
    assert.match(child, /ההסעות שלי/)
    assert.match(child, /המשימות שלי/)
    assert.match(child, /הוספת אירוע/)
    assert.doesNotMatch(child, /בקשות הסעה במשפחה/)
    assert.doesNotMatch(child, /עדכונים ממקורות/)
  } finally { globalThis.localStorage = originalStorage }
})
