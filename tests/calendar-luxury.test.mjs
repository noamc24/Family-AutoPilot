import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import fs from 'node:fs'

const result = await build({
  stdin: { contents: `export * from './src/calendarModel.ts'; export * from './src/uiModel.ts'`, resolveDir: process.cwd(), sourcefile: 'calendar-luxury-entry.ts', loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const { deriveRoutineOccurrences, visibleMonthItems, visibleMemberIds } = module.exports
const source = fs.readFileSync('src/components/CalendarView.tsx', 'utf8')

const routine = { id: 'school', kind: 'study', label: 'בית ספר', day: 1, start: '08:00', end: '14:00' }
const family = { id: 'family', name: 'משפחה', people: [
  { id: 'child', name: 'ילד', role: 'בן', color: 'lavender', routines: [routine] },
  { id: 'parent', name: 'הורה', role: 'אב', color: 'sage', routines: [] },
] }
const monday = new Date(2026, 8, 28)
const tuesday = new Date(2026, 8, 29)

test('לו״ז קבוע נגזר רק ביום השבוע המתאים ובמזהה דטרמיניסטי', () => {
  const occurrences = deriveRoutineOccurrences(family, [monday, tuesday], [], ['child'])
  assert.equal(occurrences.length, 1)
  assert.equal(occurrences[0].date, '2026-09-28')
  assert.equal(occurrences[0].id, 'routine:child:school:2026-09-28')
  assert.deepEqual(deriveRoutineOccurrences(family, [monday, tuesday], [], ['child']), occurrences)
  assert.equal(family.people[0].routines.length, 1)
})

test('override חופף מחליף occurrence קבוע ואינו מוצג ככפילות', () => {
  const override = { id: 'trip', familyId: 'family', title: 'טיול', date: '2026-09-28', time: '09:00', endTime: '13:00', participantIds: ['child'], responsibleId: '', routineOverride: true }
  assert.deepEqual(deriveRoutineOccurrences(family, [monday], [override], ['child']), [])
})

test('monthly density מציגה שלושה פריטים ומחשבת overflow', () => {
  const events = Array.from({ length: 5 }, (_, index) => ({ id: String(index), familyId: 'family', title: `אירוע ${index}`, date: '2026-09-28', time: `1${index}:00`, participantIds: ['child'], responsibleId: '', needsAttention: index === 4 }))
  const month = visibleMonthItems(events, [], '2026-09-28')
  assert.equal(month.visible.length, 3)
  assert.equal(month.overflow, 2)
  assert.equal(month.visible[0].id, '4')
})

test('בחירת אנשים ו-child visibility נשמרות', () => {
  assert.deepEqual(visibleMemberIds(family.people, 'child', false, ['parent']), ['parent'])
  assert.deepEqual(visibleMemberIds(family.people, 'child', true, ['parent']), ['child'])
})

test('כל תצוגות היומן משלבות routines, ניווט, נהג וליה', () => {
  for (const marker of ['MonthTable', 'TimeGrid', 'PeopleTable', 'RowsView', 'YearView']) assert.match(source, new RegExp(marker))
  assert.match(source, /deriveRoutineOccurrences/)
  assert.match(source, /people-schedule/)
  assert.match(source, /calendar-row \$\{isRoutine/)
  assert.match(source, /setRange\('day'\)/)
  assert.match(source, /setRange\('month'\)/)
  assert.match(source, /sourceSignalId.*✦/s)
  assert.match(source, /responsibleId.*Car/s)
})
