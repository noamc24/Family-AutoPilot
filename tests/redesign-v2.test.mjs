import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import fs from 'node:fs'

const result = await build({
  stdin: { contents: `export * from './src/uiModel.ts'; export { CalendarView } from './src/components/CalendarView.tsx'`, resolveDir: process.cwd(), sourcefile: 'redesign-v2-entry.ts', loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const { calendarDays, defaultCalendarView, eventsForMembers, homeGreeting, remainingToday, visibleMemberIds } = module.exports

const person = (role = 'אב') => ({ id: 'a', name: 'נועם', role })
const at = (hour, minute = 0) => new Date(2026, 8, 27, hour, minute)

test('ברכת הבית משתנה בגבולות הזמן המוגדרים ללא פסיק', () => {
  assert.equal(homeGreeting(person(), at(5)), 'בוקר טוב נועם')
  assert.equal(homeGreeting(person(), at(11, 59)), 'בוקר טוב נועם')
  assert.equal(homeGreeting(person(), at(12)), 'צהריים טובים נועם')
  assert.equal(homeGreeting(person(), at(15)), 'אחה״צ טובים נועם')
  assert.equal(homeGreeting(person(), at(18)), 'ערב טוב נועם')
  assert.equal(homeGreeting(person(), at(22)), 'לילה טוב נועם')
  assert.equal(homeGreeting(person(), at(2, 29)), 'לילה טוב נועם')
})

test('02:30–04:59 מציג הודעת שינה לפי המגדר של Member הפעיל', () => {
  assert.equal(homeGreeting(person('אב'), at(2, 30)), 'לך לישון 😅')
  assert.equal(homeGreeting(person('אם'), at(4, 59)), 'לכי לישון 😅')
  assert.equal(homeGreeting(person('בת'), at(3)), 'לכי לישון 😅')
})

test('brief ביתי כולל רק פריטים מהשעה הנוכחית והלאה', () => {
  const events = [
    { id: 'past', familyId: 'f', title: 'עבר', date: '2026-09-27', time: '09:00', participantIds: ['a'], responsibleId: '' },
    { id: 'future', familyId: 'f', title: 'עתיד', date: '2026-09-27', time: '16:30', participantIds: ['a'], responsibleId: '' },
  ]
  const brief = remainingToday(events, [], 'a', at(15))
  assert.deepEqual(brief.events.map(event => event.id), ['future'])
})

test('brief ביתי כולל משימות להיום ומונע הצפת משימות עתידיות', () => {
  const tasks = [
    { id: 'today', familyId: 'f', title: 'להיום', ownerId: 'a', due: '2026-09-27', done: false },
    { id: 'timed', familyId: 'f', title: 'בשעה', ownerId: 'a', due: '2026-09-27T18:00', done: false },
    { id: 'future', familyId: 'f', title: 'לעתיד', ownerId: 'a', due: '2026-09-28', done: false },
  ]
  const brief = remainingToday([], tasks, 'a', at(15))
  assert.deepEqual(brief.tasks.map(task => task.id), ['today', 'timed'])
})

test('ברירת המחדל של היומן היא ימים, טבלה וחודש וכל הטווחים זמינים', () => {
  assert.deepEqual(defaultCalendarView, { grouping: 'days', display: 'table', range: 'month' })
  assert.equal(calendarDays(at(12), 'day').length, 1)
  assert.equal(calendarDays(at(12), 'week').length, 7)
  assert.equal(calendarDays(at(12), 'month').length, 42)
})

test('בחירת אנשים מסננת אירועים ו-child mode מוגבל לעצמו', () => {
  const people = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(visibleMemberIds(people, 'b', false, ['a']), ['a'])
  assert.deepEqual(visibleMemberIds(people, 'b', true, ['a']), ['b'])
  const events = [{ id: 'a-event', participantIds: ['a'], responsibleId: '' }, { id: 'b-event', participantIds: [], responsibleId: 'b' }]
  assert.deepEqual(eventsForMembers(events, ['b']).map(event => event.id), ['b-event'])
})

test('ה-UI כולל controls לכל מצבי היומן, ניווט יום/חודש ושורות', () => {
  const source = fs.readFileSync('src/components/CalendarView.tsx', 'utf8')
  for (const copy of ['ימים', 'אנשים', 'טבלה', 'שורות', 'יומי', 'שבועי', 'חודשי', 'שנתי']) assert.match(source, new RegExp(copy))
  assert.match(source, /setRange\('day'\)/)
  assert.match(source, /setRange\('month'\)/)
  assert.match(source, /togglePerson/)
  assert.match(source, /calendar-row/)
})

test('כיתובי Demo אינם מופיעים במסכים הרגילים', () => {
  const regular = ['src/App.tsx', 'src/components/LiaCard.tsx', 'src/components/LiaChatPreview.tsx', 'src/components/ShowcaseControls.tsx'].map(path => fs.readFileSync(path, 'utf8')).join('\n')
  assert.doesNotMatch(regular, />Demo<|מצב Demo|במצב Demo|תרחישי Demo/)
  assert.match(fs.readFileSync('src/components/SettingsPage.tsx', 'utf8'), /גרסת MVP/)
})
