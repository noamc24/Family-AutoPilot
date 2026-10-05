import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const result = await build({ stdin: { contents: `export * from './src/coordination.ts'; export { LiaHomeSection } from './src/components/LiaHomeSection.tsx';`, resolveDir: process.cwd(), sourcefile: 'ride-multi-entry.tsx', loader: 'tsx' }, bundle: true, write: false, format: 'cjs', platform: 'node' })
const module = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const { acceptRideRequest, confirmDriver, forwardRequest, LiaHomeSection, requestForEvent, respondToRequest } = module.exports
const { renderToStaticMarkup } = await import('react-dom/server')

const base = () => ({
  families: [{ id: 'f', name: 'משפחה', people: [
    { id: 'a', name: 'א', role: 'אב', color: 'sage', age: 40, hasLicense: true, hasCar: true, availableForPickup: true },
    { id: 'b', name: 'ב', role: 'אם', color: 'peach', age: 38, hasLicense: true, hasCar: true, availableForPickup: true },
    { id: 'c', name: 'ג', role: 'בן', color: 'lavender', age: 22, hasLicense: true, hasCar: true, availableForPickup: true },
    { id: 'child', name: 'ילד', role: 'בן', color: 'gold', age: 8, hasLicense: false, hasCar: false, availableForPickup: false },
  ] }],
  events: [{ id: 'ride', familyId: 'f', title: 'איסוף מהחוג', date: '2026-10-05', time: '18:00', icon: '🚗', participantIds: ['child'], responsibleId: '', details: '', requiresDriver: true, needsAttention: true }],
  tasks: [], activity: [], integrationLogs: [], calendarMirrors: [], acknowledgements: [], pendingActions: [], trafficSignals: [], externalSignals: [], liaInterventions: [], liaConversations: [],
  transportationRequests: [{ id: 'request', familyId: 'f', eventId: 'ride', passengerId: 'child', eligibleMemberIds: ['a', 'b', 'c'], responses: { a: 'PENDING', b: 'PENDING', c: 'PENDING' }, selectedDriverId: '', status: 'OPEN', createdById: 'a', origin: 'בית', destination: 'חוג', requiredAt: '2026-10-05T18:00' }],
})

test('שלושה נמענים מתחילים כממתינים ודחייה אחת משאירה את האחרים פתוחים', () => {
  let data = base()
  assert.deepEqual(requestForEvent(data, 'ride').responses, { a: 'PENDING', b: 'PENDING', c: 'PENDING' })
  data = respondToRequest(data, 'request', 'a', 'CANNOT_DO')
  const request = requestForEvent(data, 'ride')
  assert.equal(request.responses.a, 'CANNOT_DO')
  assert.equal(request.responses.b, 'PENDING')
  assert.equal(request.responses.c, 'PENDING')
  assert.equal(request.status, 'PARTIALLY_RESPONDED')
  assert.equal(data.events[0].responsibleId, '')
})

test('האישור הראשון משבץ נהג, סוגר ממתינים ומעדכן את האירוע וה-UI', () => {
  const data = acceptRideRequest(base(), 'request', 'b')
  const request = requestForEvent(data, 'ride')
  assert.equal(request.status, 'COVERED')
  assert.equal(request.selectedDriverId, 'b')
  assert.equal(request.responses.b, 'CAN_DO')
  assert.equal(request.responses.a, 'CANCELLED')
  assert.equal(request.responses.c, 'CANCELLED')
  assert.equal(data.events[0].responsibleId, 'b')
  assert.equal(data.events[0].needsAttention, false)
  const html = renderToStaticMarkup(LiaHomeSection({ data, family: data.families[0], actorId: 'a' }))
  assert.doesNotMatch(html, /בקשת הסעה/)
  assert.match(html, /הכול (?:שקט|מכוסה) כרגע/)
})

test('כל הנמענים דוחים ומשאירים מצב unresolved גלוי ל-LIA', () => {
  let data = base()
  for (const id of ['a', 'b', 'c']) data = respondToRequest(data, 'request', id, 'CANNOT_DO')
  const request = requestForEvent(data, 'ride')
  assert.equal(request.status, 'UNRESOLVED')
  assert.equal(request.selectedDriverId, '')
  assert.equal(data.events[0].responsibleId, '')
  assert.equal(data.events[0].needsAttention, true)
  assert.match(data.events[0].details, /אין כרגע נהג/)
})

test('אישור stale או כפול אחרי שיבוץ אינו מחליף נהג', () => {
  const assigned = acceptRideRequest(base(), 'request', 'a')
  const staleResponse = respondToRequest(assigned, 'request', 'b', 'CAN_DO')
  const staleConfirm = confirmDriver(staleResponse, 'request', 'b')
  const duplicate = acceptRideRequest(staleConfirm, 'request', 'a')
  assert.equal(requestForEvent(duplicate, 'ride').selectedDriverId, 'a')
  assert.equal(duplicate.events[0].responsibleId, 'a')
  assert.equal(duplicate.transportationRequests.length, 1)
})

test('forward שומר מספר נמענים pending ואינו פותח מחדש בקשה מכוסה', () => {
  let data = forwardRequest(base(), 'request', 'a', ['b', 'c'])
  assert.equal(requestForEvent(data, 'ride').responses.b, 'PENDING')
  assert.equal(requestForEvent(data, 'ride').responses.c, 'PENDING')
  data = acceptRideRequest(data, 'request', 'b')
  const afterStaleForward = forwardRequest(data, 'request', 'b', ['c'])
  assert.deepEqual(afterStaleForward, data)
})
