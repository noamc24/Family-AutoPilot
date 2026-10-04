import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync('src/App.tsx', 'utf8')
const home = fs.readFileSync('src/components/LiaHomeSection.tsx', 'utf8')
const card = fs.readFileSync('src/components/LiaCard.tsx', 'utf8')
const css = fs.readFileSync('src/redesign.css', 'utf8')

test('Calm Home מציג אישור אחד ו-brief עתידי עם empty state', () => {
  assert.match(home, /הכול שקט כרגע/)
  assert.doesNotMatch(home, /הכול בשליטה/)
  assert.match(app, /remainingToday\(events, tasks, memberId\)/)
  assert.match(app, /אין עוד אירועים מתוכננים להיום/)
  assert.match(css, /content:has\(\.lia-all-good\) \.family-status\.covered \{ display: none; \}/)
})

test('future brief נשען על המודל המסודר ומציג את כל פריטי היום, נהג ו-LIA marker', () => {
  assert.match(app, /brief\.events\.map/)
  assert.match(app, /brief\.tasks\.map/)
  assert.match(app, /brief-driver/)
  assert.match(app, /sourceSignalId.*✦/s)
})

test('active, waiting ו-resolved מקבלים היררכיה ייעודית וקומפקטית', () => {
  assert.match(css, /\.view-home \.lia-card \{/)
  assert.match(css, /\.view-home \.lia-card-waiting/)
  assert.match(css, /\.view-home \.lia-handled \{/)
  assert.match(home, /slice\(0, 2\)/)
})

test('מקורות ולמה נשארים משניים ו-child restriction נשמר', () => {
  assert.match(card, /למה LIA ממליצה על זה\?/)
  assert.match(css, /\.view-home \.lia-sources, \.view-home \.lia-why \{ opacity: \.72; \}/)
  assert.match(home, /viewer\?\.age.*>= 18/)
})
