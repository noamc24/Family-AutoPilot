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
const fresh = () => structuredClone(dataModule.initialData)

test('מודל LIA מספק כרטיסי Traffic, WhatsApp ופריט שטופל', () => {
  const items = lia.buildLiaInterventions(core.initializeTrafficCoreFlow(fresh()), 'Avrahami')
  assert.equal(items.length, 3)
  const traffic = items.find(item => item.type === 'traffic')
  assert.deepEqual(traffic.sources.map(source => source.sourceId), ['waze', 'calendar'])
  assert.ok(traffic.sources.every(source => source.mode === 'demo'))
  assert.equal(traffic.status, 'decisionRequired')
  assert.ok(traffic.actions.some(action => action.kind === 'takeOwnership'))
  assert.ok(items.some(item => item.type === 'message' && item.sources[0].sourceId === 'whatsapp'))
  assert.ok(items.some(item => item.status === 'completed'))
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
