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
const tasksSource = readFileSync('src/components/TasksView.tsx', 'utf8')
const familySource = readFileSync('src/components/FamilyView.tsx', 'utf8')
const task = (id, due, ownerId = 'adult', done = false) => ({ id, familyId: 'f', title: id, due, ownerId, done })

test('Tasks filters today, week and all while child mode stays owner-only', () => {
  const items = [task('today', '2026-09-28'), task('week', '2026-10-02'), task('later', '2026-11-01'), task('other', '2026-09-28', 'child')]
  assert.deepEqual(tasksView.filterTasksForView(items, 'f', 'adult', false, 'today', '2026-09-28').map(item => item.id), ['today', 'other'])
  assert.deepEqual(tasksView.filterTasksForView(items, 'f', 'adult', false, 'week', '2026-09-28').map(item => item.id), ['today', 'week', 'other'])
  assert.equal(tasksView.filterTasksForView(items, 'f', 'adult', false, 'all', '2026-09-28').length, 4)
  assert.deepEqual(tasksView.filterTasksForView(items, 'f', 'child', true, 'all', '2026-09-28').map(item => item.id), ['other'])
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
})
