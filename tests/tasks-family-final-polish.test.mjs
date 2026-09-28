import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const tasksView = await load('src/components/TasksView.tsx')
const familyView = await load('src/components/FamilyView.tsx')
const formatting = await load('src/uiFormatting.ts')
const tasksSource = readFileSync('src/components/TasksView.tsx', 'utf8')
const familySource = readFileSync('src/components/FamilyView.tsx', 'utf8')
const task = (id, due, ownerId = 'adult', done = false) => ({ id, familyId: 'f', title: id, due, ownerId, done })

test('Tasks filters today, week and all while child mode stays owner-only', () => {
  const items = [task('today', '2026-09-28'), task('tomorrow', '2026-09-29'), task('later-this-week', '2026-10-03'), task('future-week', '2026-10-06'), task('child-today', '2026-09-28', 'child')]
  assert.deepEqual(tasksView.filterTasksForView(items, 'f', 'adult', false, 'today', '2026-09-28').map(item => item.id), ['today', 'child-today'])
  assert.deepEqual(tasksView.filterTasksForView(items, 'f', 'adult', false, 'week', '2026-09-28').map(item => item.id), ['today', 'tomorrow', 'later-this-week', 'child-today'])
  assert.equal(tasksView.filterTasksForView(items, 'f', 'adult', false, 'all', '2026-09-28').length, 5)
  assert.deepEqual(tasksView.filterTasksForView(items, 'f', 'child', true, 'all', '2026-09-28').map(item => item.id), ['child-today'])
})

test('time ranges remain chronological inside RTL surfaces', () => {
  const value = formatting.formatTimeRange('07:00', '16:00')
  assert.equal(value, '\u206607:00–16:00\u2069')
  assert.ok(value.indexOf('07:00') < value.indexOf('16:00'))
  assert.match(familySource, /formatTimeRange\(routine\.start, routine\.end\)/)
})

test('Tasks preserves completion, completed section, LIA marker, empty state and details-first actions', () => {
  assert.match(tasksSource, /visible\.filter\(task => !task\.done\)/)
  assert.match(tasksSource, /<details className="completed-tasks">/)
  assert.match(tasksSource, /title="LIA יצרה"/)
  assert.match(tasksSource, /אין לך משימות להיום/)
  assert.match(tasksSource, /setSelected\(task\)/)
  assert.match(tasksSource, /onEdit\(details\)/)
  assert.match(tasksSource, /onDelete\(details\)/)
})

test('Family shows all permitted adults, isolates child view and selects chronological next item', () => {
  const family = { id: 'f', name: 'משפחה', people: [{ id: 'adult' }, { id: 'child' }] }
  assert.equal(familyView.permittedFamilyMembers(family, 'adult', false).length, 2)
  assert.deepEqual(familyView.permittedFamilyMembers(family, 'child', true).map(person => person.id), ['child'])
  const events = [
    { id: 'later', date: '2026-09-29', time: '10:00', participantIds: ['adult'], responsibleId: '' },
    { id: 'next', date: '2026-09-28', time: '17:00', participantIds: ['adult'], responsibleId: '' },
  ]
  assert.equal(familyView.nextItemForMember(events, 'adult', '2026-09-28').id, 'next')
})

test('Family overview derives status, responsibility and opens read profile before edit', () => {
  assert.match(familySource, /status\(person\)/)
  assert.match(familySource, /className="ride-line"/)
  assert.match(familySource, /setSelectedId\(person\.id\)/)
  assert.match(familySource, /className="detail-sheet member-profile"/)
  assert.match(familySource, /onEdit\(selected\)/)
  assert.match(familySource, /className="child-family-summary"/)
  assert.match(familySource, /השגרה שלי/)
})
