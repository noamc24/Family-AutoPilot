import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['src/data.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const data = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

test('המשפחה הראשונה כוללת את שני ההורים ושלושת הילדים עם שנות לידה', () => {
  const family = data.initialData.families[0]
  assert.equal(family.name, 'משפחת אברהמי')
  assert.deepEqual(family.people.map(person => [person.name, person.birthYear, person.role]), [
    ['אוראל', 1988, 'אב'], ['מור', 1993, 'אם'], ['איתמר', 2018, 'בן'], ['עומר', 2020, 'בן'], ['יהונתן', 2022, 'בן'],
  ])
  assert.ok(data.initialData.events.find(event => event.id === 'dinner').participantIds.includes('yehonatan'))
})

test('טעינת המשפחה הישנה מחליפה רק את ברירת המחדל ושומרת אירועים שנוספו', () => {
  const saved = structuredClone(data.initialData)
  saved.families[0].name = 'משפחת כהן'
  saved.families[0].people = saved.families[0].people.filter(person => person.id !== 'yehonatan').map(person => ({ ...person, birthYear: undefined, name: { adam: 'אדם', maya: 'מאיה', yuval: 'יובל', noa: 'נועה' }[person.id] }))
  saved.events.find(event => event.id === 'pickup').title = 'איסוף יובל מכדורגל'
  saved.events.push({ id: 'custom', familyId: 'cohen', title: 'אירוע שנוסף', date: data.localDate(1), time: '15:00', icon: '📅', participantIds: ['yuval'], responsibleId: '', details: '' })
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(saved) }
  try {
    const restored = data.readData()
    assert.equal(restored.families[0].people.length, 5)
    assert.equal(restored.families[0].name, 'משפחת אברהמי')
    assert.equal(restored.families[0].people.find(person => person.id === 'maya').name, 'מור')
    assert.equal(restored.events.find(event => event.id === 'pickup').title, 'איסוף איתמר מכדורגל')
    assert.ok(restored.events.some(event => event.id === 'custom'))
  } finally { globalThis.localStorage = originalStorage }
})

test('שם משפחת ברירת המחדל מתעדכן בנתונים קיימים בלי לשנות שם מותאם אישית', () => {
  const originalStorage = globalThis.localStorage
  try {
    for (const [savedName, expectedName] of [['המשפחה של אוראל ומור', 'משפחת אברהמי'], ['משפחת לוי', 'משפחת לוי']]) {
      const saved = structuredClone(data.initialData)
      saved.families[0].name = savedName
      globalThis.localStorage = { getItem: () => JSON.stringify(saved) }
      assert.equal(data.readData().families[0].name, expectedName)
    }
  } finally { globalThis.localStorage = originalStorage }
})
