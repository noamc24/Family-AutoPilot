import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['src/data.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const model = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

const now = new Date('2026-09-29T15:00:00')
const family = { id: 'f', name: 'משפחה', people: [{ id: 'p', name: 'הורה', role: 'אב', color: 'sage', age: 40, hasLicense: true, hasCar: true, availableForPickup: true, routines: [{ id: 'work', kind: 'work', label: 'עבודה', days: [2], start: '08:00', end: '16:00' }] }] }
const event = (id, date, time, endTime) => ({ id, familyId: 'f', title: id, date, time, endTime, icon: '•', participantIds: ['p'], responsibleId: 'p', details: '' })

function fixture() {
  return {
    families: [family],
    events: [event('past', '2026-09-29', '12:00'), event('ended', '2026-09-29', '13:00', '14:00'), event('today-future', '2026-09-29', '17:00'), event('future', '2026-09-30', '09:00')],
    tasks: [{ id: 'orphan-task', familyId: 'f', title: 'קשורה', ownerId: 'p', due: '2026-09-29', done: false, eventId: 'past' }],
    activity: [{ id: 'activity', familyId: 'f', text: 'ישן', personIds: ['p'], eventId: 'past' }],
    transportationRequests: [{ id: 'ride', familyId: 'f', eventId: 'past', passengerId: 'p', eligibleMemberIds: ['p'], responses: { p: 'PENDING' }, selectedDriverId: '', status: 'OPEN', createdById: 'p', origin: '', destination: '', requiredAt: '' }],
    integrationLogs: [{ id: 'log', familyId: 'f', scenarioKey: 'past', source: 'calendar', sourceText: '', action: '', personIds: ['p'], eventId: 'past', createdAt: now.toISOString() }],
    calendarMirrors: [{ id: 'mirror', familyId: 'f', eventId: 'past', personId: 'p', provider: 'google', createdAt: now.toISOString() }],
    acknowledgements: [{ eventId: 'past', personId: 'p', signature: '', status: 'pending' }],
    pendingActions: [{ id: 'pending', familyId: 'f', source: 'scenario', scenarioId: 'past', message: '', createdAt: now.toISOString() }],
    dismissedActionIds: [], trafficSignals: [{ id: 'traffic', familyId: 'f', source: 'waze', relatedEventId: 'past', previousTravelMinutes: 10, currentTravelMinutes: 20, timestamp: now.toISOString(), severity: 'meaningful' }],
    externalSignals: [{ id: 'signal', familyId: 'f', sourceId: 'whatsapp', ownerMemberId: 'p', receivedAt: now.toISOString(), privatePayload: '', familyInsight: '', signalType: 'eventUpdate', status: 'detected', eventCandidate: { targetEventId: 'past', title: '', date: '2026-09-29', time: '12:00', originalTime: '11:00', relatedMemberId: 'p' } }],
    liaInterventions: [{ id: 'lia', familyId: 'f', signalId: 'signal', type: 'calendar', title: '', detectedChange: '', whyItMatters: '', recommendation: '', sources: [], actions: [], status: 'waiting', explanation: '', relatedEventId: 'past', relatedMemberIds: ['p'], createdAt: now.toISOString(), updatedAt: now.toISOString(), visibility: { audience: 'family' } }],
    liaConversations: [],
  }
}

test('expired one-time events are pruned while future events and recurring definitions remain', () => {
  const cleaned = model.pruneExpiredData(fixture(), now)
  assert.deepEqual(cleaned.events.map(item => item.id), ['today-future', 'future'])
  assert.equal(cleaned.families[0].people[0].routines.length, 1)
})

test('expired event dependents are removed and cleanup is idempotent', () => {
  const cleaned = model.pruneExpiredData(fixture(), now)
  for (const key of ['tasks', 'activity', 'transportationRequests', 'integrationLogs', 'calendarMirrors', 'acknowledgements', 'pendingActions', 'trafficSignals', 'externalSignals', 'liaInterventions']) assert.equal(cleaned[key].length, 0, key)
  assert.deepEqual(model.pruneExpiredData(cleaned, now), cleaned)
})
