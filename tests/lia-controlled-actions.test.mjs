import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

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

test('proposal is validated and does not mutate application data', () => {
  const source = context()
  const before = structuredClone(source)
  const result = createActionProposal('propose_update_event_time', { targetId: 'club', time: '18:00' }, source)
  assert.equal(result.before.time, '17:00')
  assert.equal(result.after.time, '18:00')
  assert.equal(result.requiresConfirmation, true)
  assert.deepEqual(source, before)
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

