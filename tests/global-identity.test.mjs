import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync('src/redesign.css', 'utf8')

test('זהות LIA המרכזית משתמשת ב-Indigo ובזהב כאקסנט נפרד', () => {
  for (const token of ['--lia-primary:', '--lia-primary-soft:', '--lia-gold:', '--active:', '--focus:', '--surface:', '--border:', '--motion:']) assert.match(css, new RegExp(token))
  assert.match(css, /--lia-accent: var\(--lia-gold\)/)
  assert.match(css, /--lia-soft: var\(--lia-primary-soft\)/)
})

test('sidebar מתרחב ב-hover וב-keyboard focus ללא שינוי footprint של התוכן', () => {
  assert.match(css, /\.sidebar:hover, \.sidebar:focus-within/)
  assert.match(css, /\.main-column \{ margin-inline-end: 84px; \}/)
  assert.match(css, /width: 224px/)
  assert.match(css, /\.sidebar:hover \.nav-item::after, \.sidebar:focus-within \.nav-item::after \{ display: none; \}/)
})

test('selected states גלובליים וניווט מובייל משתמשים ב-active Indigo ולא ברקע צהוב', () => {
  assert.match(css, /\.nav-item\.active \{ color: var\(--active\)/)
  assert.match(css, /\.mobile-nav button\.active \{ color: var\(--lia-primary\); background: var\(--lia-primary-soft\); \}/)
  assert.match(css, /\.calendar-segment button\.active, \.task-filters button\.active/)
})
