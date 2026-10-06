import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const result = await build({
  stdin: { contents: `export { executeLiaReadTool } from './server/lia/tools/executeTool.ts'; export { LIA_READ_TOOLS } from './server/lia/tools/definitions.ts'; export { askLIA } from './server/lia/liaService.ts';`, resolveDir: process.cwd(), sourcefile: 'lia-tools-entry.ts', loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const { executeLiaReadTool, LIA_READ_TOOLS, askLIA } = module.exports

const context = () => ({
  today: '2026-10-06',
  family: { id: 'f', name: 'משפחה', people: [
    { id: 'adult', name: 'אוראל', role: 'אב', color: 'sage', age: 38, hasLicense: true, hasCar: true, availableForPickup: true, availability: 'available' },
    { id: 'busy', name: 'מור', role: 'אם', color: 'peach', age: 35, hasLicense: true, hasCar: true, availableForPickup: true, availability: 'available', routines: [{ id: 'work', kind: 'work', label: 'עבודה', days: [2], start: '16:00', end: '19:00' }] },
    { id: 'child', name: 'איתמר', role: 'בן', color: 'lavender', age: 9, hasLicense: false, hasCar: false, availableForPickup: false },
  ] },
  events: [{ id: 'club', familyId: 'f', title: 'חוג של איתמר', date: '2026-10-06', time: '18:00', icon: '⚽', participantIds: ['child'], responsibleId: '', details: '', requiresDriver: true }],
  tasks: [{ id: 'task', familyId: 'f', title: 'אישור הורים', ownerId: 'busy', due: '2026-10-06', done: false }],
  transportationRequests: [],
})

test('identity question completes without executing a tool', async () => {
  let calls = 0
  const complete = async () => { calls += 1; return { role: 'assistant', content: 'אני LIA.' } }
  const result = await askLIA('מי את?', context(), complete)
  assert.equal(result.reply, 'אני LIA.')
  assert.deepEqual(result.toolTrace, [])
  assert.equal(calls, 1)
})

test('schedule, availability and tasks return real scoped data', () => {
  const schedule = executeLiaReadTool('get_schedule', { date: '2026-10-06' }, context())
  assert.equal(schedule.events[0].title, 'חוג של איתמר')
  assert.deepEqual({ date: schedule.date, weekday: schedule.weekday, isToday: schedule.isToday }, { date: '2026-10-06', weekday: 'שלישי', isToday: true })
  const availability = executeLiaReadTool('get_member_availability', { date: '2026-10-06', time: '18:00' }, context())
  assert.equal(availability.weekday, 'שלישי')
  assert.equal(availability.members.find(item => item.name === 'מור').available, false)
  const tasks = executeLiaReadTool('get_tasks', { date: '2026-10-06', status: 'open' }, context())
  assert.equal(tasks.weekday, 'שלישי')
  assert.equal(tasks.tasks[0].title, 'אישור הורים')
})

test('driver lookup reuses deterministic Family Autopilot eligibility', () => {
  const result = executeLiaReadTool('find_available_drivers', { eventId: 'club' }, context())
  assert.deepEqual(result.eligibleDrivers.map(item => item.name), ['אוראל'])
  assert.match(result.excluded.find(item => item.name === 'מור').reason, /לו״ז קבוע/)
})

test('missing data stays empty instead of being invented', () => {
  const result = executeLiaReadTool('get_schedule', { date: '2026-10-07' }, context())
  assert.deepEqual(result.events, [])
  assert.equal(result.weekday, 'רביעי')
  assert.equal(result.isToday, false)
})

test('empty date-scoped results retain deterministic calendar grounding', () => {
  const emptyTasks = executeLiaReadTool('get_tasks', { date: '2026-10-07' }, context())
  const conflicts = executeLiaReadTool('get_schedule_conflicts', {}, context())
  assert.deepEqual(emptyTasks.tasks, [])
  assert.equal(emptyTasks.weekday, 'רביעי')
  assert.deepEqual({ date: conflicts.date, weekday: conflicts.weekday, isToday: conflicts.isToday }, { date: '2026-10-06', weekday: 'שלישי', isToday: true })
})

test('tool loop returns deterministic results to the model', async () => {
  let turn = 0
  const complete = async messages => {
    turn += 1
    if (turn === 1) return { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'get_schedule', arguments: '{"date":"2026-10-06"}' } }] }
    assert.match(messages.at(-1).content, /חוג של איתמר/)
    return { role: 'assistant', content: 'היום יש חוג של איתמר בשש.' }
  }
  const result = await askLIA('מה יש היום?', context(), complete)
  assert.equal(result.toolTrace[0].name, 'get_schedule')
  assert.equal(result.reply, 'היום יש חוג של איתמר בשש.')
})

test('unknown and invalid tool calls are rejected and no write tool exists', () => {
  assert.throws(() => executeLiaReadTool('delete_calendar_event', {}, context()), /Unknown/)
  assert.throws(() => executeLiaReadTool('get_schedule', { path: 'families.0' }, context()), /Invalid/)
  assert.ok(LIA_READ_TOOLS.every(tool => !/create|update|delete|assign|approve|reject/.test(tool.function.name)))
})

test('mutation request cannot alter the read context', async () => {
  const data = context()
  const before = structuredClone(data)
  const complete = async () => ({ role: 'assistant', content: 'אני מבינה שמדובר בשינוי השעה, אבל אין לי אפשרות לבצע אותו.' })
  await askLIA('תעבירי את החוג של איתמר לשש', data, complete)
  assert.deepEqual(data, before)
})
