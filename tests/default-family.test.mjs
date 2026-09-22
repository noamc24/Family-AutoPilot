import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['src/data.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const data = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

test('משפחת ברירת המחדל כוללת תאריכי לידה ושגרות לילדים', () => {
  const family = data.initialData.families[0]
  assert.equal(family.id, 'Avrahami')
  assert.equal(family.name, 'משפחת אברהמי')
  assert.deepEqual(family.people.map(person => [person.name, person.birthDate, person.role]), [
    ['אוראל', '1988-11-06', 'אב'], ['מור', '1993-12-12', 'אם'], ['איתמר', '2018-10-06', 'בן'], ['עומר', '2021-12-30', 'בן'], ['יהונתן', '2024-11-11', 'בן'],
  ])
  for (const person of family.people.filter(person => person.age < 18)) {
    const expected = person.id === 'yehonatan'
      ? [[0, 1, 2, 3, 4, 5], '08:00', '16:00']
      : [[0, 1, 2, 3, 4], [5], '08:00', '16:00']
    const days = person.routines.map(routine => routine.days || [routine.day]).flat()
    assert.ok(days.length >= 5)
    assert.ok(person.routines.every(routine => routine.start === '08:00'))
    assert.ok(person.routines.every(routine => routine.end === '16:00' || routine.end === '13:30'))
  }
  assert.ok(family.people.find(person => person.id === 'yehonatan').routines.every(routine => routine.label === 'מעון'))
  assert.ok(data.initialData.events.find(event => event.id === 'dinner').participantIds.includes('yehonatan'))
})

test('טעינת המשפחה הישנה מחליפה רק את ברירת המחדל ושומרת אירועים שנוספו', () => {
  const saved = structuredClone(data.initialData)
  saved.families[0].id = 'cohen'
  for (const collection of ['events', 'tasks', 'activity']) saved[collection].forEach(item => { item.familyId = 'cohen' })
  saved.families[0].name = 'משפחת כהן'
  saved.families[0].people = saved.families[0].people.filter(person => person.id !== 'yehonatan').map(person => ({ ...person, birthDate: undefined, birthYear: undefined, routines: undefined, name: { adam: 'אדם', maya: 'מאיה', yuval: 'יובל', noa: 'נועה' }[person.id] }))
  saved.events.find(event => event.id === 'pickup').title = 'איסוף יובל מכדורגל'
  saved.events.push({ id: 'custom', familyId: 'cohen', title: 'אירוע שנוסף', date: data.localDate(1), time: '15:00', icon: '📅', participantIds: ['yuval'], responsibleId: '', details: '' })
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(saved) }
  try {
    const restored = data.readData()
    assert.equal(restored.families[0].people.length, 5)
    assert.equal(restored.families[0].id, 'Avrahami')
    assert.equal(restored.families[0].name, 'משפחת אברהמי')
    assert.equal(restored.families[0].people.find(person => person.id === 'maya').name, 'מור')
    assert.equal(restored.families[0].people.find(person => person.id === 'noa').birthDate, '2021-12-30')
    assert.equal(restored.families[0].people.find(person => person.id === 'yuval').routines.length, 2)
    assert.equal(restored.events.find(event => event.id === 'pickup').title, 'איסוף איתמר מכדורגל')
    assert.equal(restored.events.find(event => event.id === 'custom').familyId, 'Avrahami')
  } finally { globalThis.localStorage = originalStorage }
})

test('שם משפחת ברירת המחדל מתעדכן בנתונים קיימים בלי לשנות שם מותאם אישית', () => {
  const originalStorage = globalThis.localStorage
  try {
    for (const [savedName, expectedName] of [['המשפחה של אוראל ומור', 'משפחת אברהמי'], ['משפחת לוי', 'משפחת לוי']]) {
      const saved = structuredClone(data.initialData)
      saved.families[0].id = 'cohen'
      saved.events.forEach(event => { event.familyId = 'cohen' })
      saved.tasks.forEach(task => { task.familyId = 'cohen' })
      saved.activity.forEach(entry => { entry.familyId = 'cohen' })
      saved.families[0].name = savedName
      globalThis.localStorage = { getItem: () => JSON.stringify(saved) }
      assert.equal(data.readData().families[0].name, expectedName)
      assert.equal(data.readData().families[0].id, 'Avrahami')
    }
  } finally { globalThis.localStorage = originalStorage }
})
