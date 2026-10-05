import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const dataModule = await load('src/data.ts')
const lia = await load('src/liaInterventions.ts')
const core = await load('src/liaCoreFlow.ts')
const showcase = await load('src/showcaseFlows.ts')
const fresh = () => structuredClone(dataModule.initialData)

test('מודל LIA מספק רק התערבויות אמיתיות עם state בר-ביצוע', () => {
  let data = core.initializeTrafficCoreFlow(fresh())
  const signal = showcase.createDemoShowcaseSignal(data, 'Avrahami', 'Mor', 'whatsapp-calendar')
  data = showcase.receiveShowcaseSignal(data, signal)
  const items = lia.buildLiaInterventions(data, 'Avrahami')
  assert.equal(items.length, 2)
  const traffic = items.find(item => item.type === 'traffic')
  assert.deepEqual(traffic.sources.map(source => source.sourceId), ['waze', 'calendar'])
  assert.ok(traffic.sources.every(source => source.mode === 'demo'))
  assert.equal(traffic.status, 'decisionRequired')
  assert.ok(traffic.actions.some(action => action.kind === 'takeOwnership'))
  assert.ok(items.some(item => item.type === 'message' && item.sources[0].sourceId === 'whatsapp'))
  assert.ok(items.every(item => !item.id.startsWith('lia-demo-')))
})

test('שינוי אירוע ממתין משחזר פעולות, ואישור או דחייה פועלים ונשמרים', () => {
  const base = fresh()
  base.events.forEach(event => { event.date = dataModule.localDate(1) })
  const signal = showcase.createDemoShowcaseSignal(base, 'Avrahami', 'Mor', 'whatsapp-calendar')
  const received = showcase.receiveShowcaseSignal(base, signal)
  const originalEvent = received.events.find(event => event.id === signal.eventCandidate.targetEventId)
  const waitingData = {
    ...received,
    liaInterventions: received.liaInterventions.map(item => item.signalId === signal.id ? { ...item, status: 'waiting', actions: [] } : item),
  }
  const waiting = lia.buildLiaInterventions(waitingData, 'Avrahami').find(item => item.signalId === signal.id)
  assert.deepEqual(waiting.actions.map(action => [action.label, action.kind]), [
    ['אישור ועדכון', 'addToCalendar'],
    ['דחייה', 'dismiss'],
  ])

  const approved = showcase.applyShowcaseAction(waitingData, waiting.id, 'addToCalendar', 'Mor')
  const persistedApproval = dataModule.sanitizeAppData(structuredClone(approved))
  assert.equal(persistedApproval.events.find(event => event.id === originalEvent.id).time, signal.eventCandidate.time)
  assert.equal(persistedApproval.liaInterventions.find(item => item.id === waiting.id).status, 'completed')
  assert.deepEqual(lia.buildLiaInterventions(persistedApproval, 'Avrahami').find(item => item.id === waiting.id).actions, [])

  const rejected = showcase.applyShowcaseAction(waitingData, waiting.id, 'dismiss', 'Mor')
  const persistedRejection = dataModule.sanitizeAppData(structuredClone(rejected))
  assert.equal(persistedRejection.events.find(event => event.id === originalEvent.id).time, originalEvent.time)
  assert.equal(persistedRejection.liaInterventions.find(item => item.id === waiting.id).status, 'noAction')
  assert.deepEqual(lia.buildLiaInterventions(persistedRejection, 'Avrahami').find(item => item.id === waiting.id).actions, [])
})

test('פעולות בכרטיס LIA מעבירות אותו בין סטטוסים מוגדרים', () => {
  const traffic = lia.buildLiaInterventions(core.initializeTrafficCoreFlow(fresh()), 'Avrahami').find(item => item.type === 'traffic')
  const owned = lia.transitionLiaIntervention(traffic, 'takeOwnership', 'מור')
  assert.equal(owned.status, 'inProgress')
  assert.match(owned.statusDetail, /מור/)
  const waiting = lia.transitionLiaIntervention(traffic, 'cannotDo')
  assert.equal(waiting.status, 'waiting')
  const completed = lia.transitionLiaIntervention(traffic, 'approve')
  assert.equal(completed.status, 'completed')
  assert.deepEqual(completed.actions, [])
  const dismissed = lia.transitionLiaIntervention(traffic, 'dismiss')
  assert.equal(dismissed.status, 'noAction')
})

test('משפחה ללא תרחישי דמו מקבלת מצב ריק תקין', () => {
  const data = fresh()
  data.families.push({ id: 'quiet', name: 'משפחה שקטה', people: [] })
  assert.deepEqual(lia.buildLiaInterventions(data, 'quiet'), [])
})
