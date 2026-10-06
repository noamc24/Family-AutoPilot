import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

const built = await build({
  stdin: { contents: `export { createActionProposal } from './server/lia/tools/proposalTools.ts'; export { askLIA } from './server/lia/liaService.ts'; export { resolveLiaActionProposal } from './src/liaProposalActions.ts'; export { appendLiaProposalReply, conversationFor, resolveLiaProposalMessage } from './src/liaChat.ts';`, resolveDir: process.cwd(), sourcefile: 'lia-controlled-actions-entry.ts', loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const { createActionProposal, askLIA, resolveLiaActionProposal, appendLiaProposalReply, conversationFor, resolveLiaProposalMessage } = module.exports

const context = () => ({
  today: '2026-10-06',
  family: { id: 'f', name: 'משפחה', people: [{ id: 'child', name: 'איתמר', role: 'בן', color: 'sage', age: 9, hasLicense: false, hasCar: false, availableForPickup: false }] },
  events: [{ id: 'club', familyId: 'f', title: 'החוג של איתמר', date: '2026-10-06', time: '17:00', icon: '⚽', participantIds: ['child'], responsibleId: '', details: '' }],
  tasks: [], transportationRequests: [],
})
const appData = () => ({ ...structuredClone(context()), families: [structuredClone(context().family)], activity: [], integrationLogs: [], calendarMirrors: [], liaConversations: [] })
const proposal = () => createActionProposal('propose_update_event_time', { targetId: 'club', time: '18:00' }, context())
const createEventProposal = (overrides = {}) => createActionProposal('propose_create_event', { title: 'אימון שחייה', date: 'tomorrow', time: '18:00', member: 'איתמר', ...overrides }, context())
const createTaskProposal = (overrides = {}) => createActionProposal('propose_create_task', { title: 'להכין תיק', due: 'tomorrow', member: 'איתמר', ...overrides }, context())

test('proposal is validated and does not mutate application data', () => {
  const source = context()
  const before = structuredClone(source)
  const result = createActionProposal('propose_update_event_time', { targetId: 'club', time: '18:00' }, source)
  assert.equal(result.before.time, '17:00')
  assert.equal(result.after.time, '18:00')
  assert.equal(result.requiresConfirmation, true)
  assert.deepEqual(source, before)
})

test('proposal UI isolates old-to-new values from RTL reordering', async () => {
  const source = await readFile(new URL('../src/components/LiaChatPreview.tsx', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../src/redesign.css', import.meta.url), 'utf8')
  assert.match(source, /lia-proposal-transition" dir="ltr"/)
  assert.match(source, /proposal\.before\.time[\s\S]*→[\s\S]*proposal\.after\.time/)
  assert.match(styles, /\.lia-proposal-transition[\s\S]*unicode-bidi:\s*isolate/)
})

test('approval executes deterministic event mutation and rejection does not', () => {
  const data = appData()
  const approved = resolveLiaActionProposal(data, 'f', proposal(), 'approve')
  assert.equal(approved.data.events[0].time, '18:00')
  assert.equal(approved.success, true)
  const rejected = resolveLiaActionProposal(data, 'f', proposal(), 'reject')
  assert.equal(rejected.data.events[0].time, '17:00')
  assert.equal(rejected.status, 'dismissed')
})

test('create event and task proposals are grounded and do not mutate data', () => {
  const source = context()
  const before = structuredClone(source)
  const event = createEventProposal()
  const task = createTaskProposal()
  assert.deepEqual(source, before)
  assert.deepEqual({ date: event.date, weekday: event.weekday, participant: event.participant }, { date: '2026-10-07', weekday: 'רביעי', participant: { id: 'child', name: 'איתמר' } })
  assert.deepEqual({ due: task.due, weekday: task.weekday, assignee: task.assignee }, { due: '2026-10-07', weekday: 'רביעי', assignee: { id: 'child', name: 'איתמר' } })
  assert.equal(event.requiresConfirmation, true)
  assert.equal(task.requiresConfirmation, true)
})

test('approval creates exactly one event or task and rejection creates none', () => {
  const data = appData()
  const eventProposal = createEventProposal()
  const approvedEvent = resolveLiaActionProposal(data, 'f', eventProposal, 'approve', 'child')
  assert.equal(approvedEvent.data.events.length, data.events.length + 1)
  assert.equal(approvedEvent.data.events.at(-1).title, 'אימון שחייה')
  assert.equal(approvedEvent.data.events.at(-1).participantIds[0], 'child')
  assert.equal(resolveLiaActionProposal(data, 'f', eventProposal, 'reject').data.events.length, data.events.length)

  const taskProposal = createTaskProposal()
  const approvedTask = resolveLiaActionProposal(data, 'f', taskProposal, 'approve')
  assert.equal(approvedTask.data.tasks.length, 1)
  assert.deepEqual(approvedTask.data.tasks[0], { id: approvedTask.data.tasks[0].id, familyId: 'f', title: 'להכין תיק', ownerId: 'child', due: '2026-10-07', done: false })
  assert.equal(resolveLiaActionProposal(data, 'f', taskProposal, 'reject').data.tasks.length, 0)
})

test('create proposals reject missing, unknown and invented fields and include deterministic conflicts', () => {
  assert.throws(() => createActionProposal('propose_create_event', { title: 'אימון', date: 'today', time: '18:00' }, context()), /fields/)
  assert.throws(() => createActionProposal('propose_create_event', { title: 'אימון', date: 'today', time: '18:00', member: 'מישהו' }, context()), /values/)
  assert.throws(() => createActionProposal('propose_create_task', { title: 'תיק', due: 'tomorrow', member: 'איתמר', ownerId: 'child' }, context()), /fields/)
  const conflict = createEventProposal({ date: 'today', time: '17:00' })
  assert.ok(conflict.warnings.length > 0)
})

test('duplicate approval creates an event at most once', () => {
  const data = appData()
  const withProposal = appendLiaProposalReply(data, 'f', 'child', 'אירוע מוצע', createEventProposal())
  const messageId = conversationFor(withProposal, 'f', 'child').messages.at(-1).id
  const once = resolveLiaProposalMessage(withProposal, 'f', 'child', messageId, 'approve')
  const twice = resolveLiaProposalMessage(once, 'f', 'child', messageId, 'approve')
  assert.equal(once.events.filter(event => event.title === 'אימון שחייה').length, 1)
  assert.strictEqual(twice, once)
})

test('unknown type, target and fields are rejected', () => {
  assert.throws(() => createActionProposal('delete_everything', {}, context()), /Unsupported/)
  assert.throws(() => createActionProposal('propose_update_event_time', { targetId: 'missing', time: '18:00' }, context()), /Unknown/)
  assert.throws(() => createActionProposal('propose_update_event_time', { targetId: 'club', time: '18:00', path: 'events' }, context()), /fields/)
  const invalid = { ...proposal(), type: 'unknown' }
  assert.equal(resolveLiaActionProposal(appData(), 'f', invalid, 'approve').status, 'failed')
})

test('stale proposal is rejected and duplicate approval executes at most once', () => {
  const data = appData()
  const staleData = { ...data, events: data.events.map(event => ({ ...event, time: '17:30' })) }
  assert.equal(resolveLiaActionProposal(staleData, 'f', proposal(), 'approve').status, 'failed')

  const withProposal = appendLiaProposalReply(data, 'f', 'child', 'שינוי מוצע', proposal())
  const messageId = conversationFor(withProposal, 'f', 'child').messages.at(-1).id
  const once = resolveLiaProposalMessage(withProposal, 'f', 'child', messageId, 'approve')
  const twice = resolveLiaProposalMessage(once, 'f', 'child', messageId, 'approve')
  assert.equal(once.events[0].time, '18:00')
  assert.strictEqual(twice, once)
  assert.equal(conversationFor(once, 'f', 'child').messages.filter(item => item.type === 'actionResult').length, 1)
})

test('ambiguous, nonexistent and read-only turns do not create proposals', async () => {
  let ambiguousTurn = 0
  const ambiguous = await askLIA('תעבירי את החוג לשש', context(), async () => {
    ambiguousTurn += 1
    return ambiguousTurn === 1
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'read', type: 'function', function: { name: 'get_schedule', arguments: '{}' } }] }
      : { role: 'assistant', content: 'לאיזה חוג התכוונת?', tool_calls: [] }
  })
  assert.equal(ambiguous.proposal, undefined)

  let missingTurn = 0
  const missing = await askLIA('תעבירי אירוע חסר לשש', context(), async () => {
    missingTurn += 1
    return missingTurn === 1
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'proposal', type: 'function', function: { name: 'propose_update_event_time', arguments: '{"targetId":"missing","time":"18:00"}' } }] }
      : { role: 'assistant', content: 'לא מצאתי אירוע מתאים.', tool_calls: [] }
  })
  assert.equal(missing.proposal, undefined)

  const readOnly = await askLIA('מה יש היום?', context(), async () => ({ role: 'assistant', content: 'היום יש חוג.', tool_calls: [] }))
  assert.equal(readOnly.proposal, undefined)
})

