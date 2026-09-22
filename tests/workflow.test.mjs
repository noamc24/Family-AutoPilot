import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['src/workflow.ts', 'src/domain.ts', 'src/data.ts'], bundle: true, write: false, format: 'esm', platform: 'node', outdir: 'out' })
const modules = Object.fromEntries(await Promise.all(result.outputFiles.map(async file => [file.path.split(/[\\/]/).at(-1), await import(`data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`)])))
const workflow = modules['workflow.js']
const domain = modules['domain.js']
const { initialData, localDate } = modules['data.js']

test('שגרה מרובת ימים נחשבת כקבועה לכל אחד מהימים שנבחרו', () => {
  const data = structuredClone(initialData)
  const day = new Date(`${localDate()}T12:00:00`).getDay()
  const nextDay = (day + 1) % 7
  const person = { ...data.families[0].people[0], routines: [{ id: 'multi-1', kind: 'study', label: 'בית ספר', days: [day, nextDay], start: '08:00', end: '16:00' }] }
  assert.equal(workflow.routineAt(person, localDate(), '07:30', '08:30')?.id, 'multi-1')
  assert.equal(workflow.routineAt(person, localDate(1), '07:30', '08:30')?.id, 'multi-1')
  assert.equal(workflow.routineAt(person, localDate(2), '07:30', '08:30')?.id, undefined)
})

test('לו״ז שבועי חוסם הסעה באותה שעה ואפשר לאשר חריגה חד־פעמית', () => {
  const data = structuredClone(initialData)
  const day = new Date(`${localDate()}T12:00:00`).getDay()
  const person = { ...data.families[0].people[0], routines: [{ id: 'work-1', kind: 'work', label: 'עבודה', day, start: '08:00', end: '18:00' }] }
  const event = { id: 'new-ride', familyId: data.families[0].id, date: localDate(), time: '16:00' }
  assert.match(domain.pickupIneligibility(person, event, data), /בלו״ז קבוע/)
  assert.equal(domain.pickupIneligibility(person, { ...event, routineOverride: true }, data), null)
})

test('אירוע מרובה ימים נוצר ככפילות יומיות בלוח', () => {
  const start = localDate()
  const end = localDate(2)
  const entries = domain.expandEventDates({ id: 'multi-day', familyId: 'Avrahami', title: 'מחנה קיץ', date: start, endDate: end, time: '09:00', icon: '🏕️', participantIds: ['yuval'], responsibleId: 'maya', details: '', requiresDriver: false })
  assert.equal(entries.length, 3)
  assert.deepEqual(entries.map(item => item.date), [start, localDate(1), end])
  assert.ok(entries.every(item => item.title === 'מחנה קיץ'))
})

test('שגרה עם הכנה יוצרת משימה אחת בלבד ומשמרת השלמה', () => {
  let data = structuredClone(initialData)
  const day = new Date(`${localDate()}T12:00:00`).getDay()
  data.families[0].people[0].routines = [{ id: 'activity-1', kind: 'activity', label: 'חוג', day, start: '17:00', end: '18:00', prepTitle: 'להכין ציוד' }]
  data = workflow.materializeRoutineTasks(data)
  const generated = data.tasks.find(task => task.routineId === 'activity-1' && task.due === localDate())
  assert.ok(generated)
  assert.equal(generated.ownerId, 'adam')
  const count = data.tasks.length
  data.tasks.find(task => task.id === generated.id).done = true
  data = workflow.materializeRoutineTasks(data)
  assert.equal(data.tasks.length, count)
  assert.equal(data.tasks.find(task => task.id === generated.id).done, true)
})

test('שינוי באירוע דורש אישור חדש ואישור קיים נשמר אם לא השתנה', () => {
  let data = structuredClone(initialData)
  data.events.push({ id: 'new', familyId: 'Avrahami', title: 'חוג חדש', date: localDate(1), time: '17:00', icon: '📅', participantIds: ['yuval'], responsibleId: 'maya', details: '', createdById: 'adam' })
  data = workflow.syncAcknowledgements(data)
  assert.equal(data.acknowledgements.length, 2)
  data.acknowledgements[0].status = 'approved'
  assert.equal(workflow.syncAcknowledgements(data), data)
  data.events.find(event => event.id === 'new').time = '18:00'
  data = workflow.syncAcknowledgements(data)
  assert.ok(data.acknowledgements.every(item => item.status === 'pending'))
})

test('הכול בשליטה תלוי בהסעות, משימות חשובות, אישורים ועדכונים חיצוניים', () => {
  const data = structuredClone(initialData)
  data.events = []
  data.tasks = []
  data.transportationRequests = []
  data.integrationLogs = []
  data.acknowledgements = []
  assert.deepEqual(workflow.closureIssues(data, 'Avrahami'), [])
  data.tasks.push({ id: 'important', familyId: 'Avrahami', title: 'משימה', ownerId: '', due: localDate(), done: false, priority: 'high' })
  data.integrationLogs.push({ id: 'update', familyId: 'Avrahami', scenarioKey: 'x', source: 'school', sourceText: 'שינוי', action: 'עודכן', personIds: [], createdAt: new Date().toISOString() })
  const issues = workflow.closureIssues(data, 'Avrahami')
  assert.ok(issues.some(issue => issue.includes('משימות')))
  assert.ok(issues.some(issue => issue.includes('עדכונים')))
  data.tasks[0].ownerId = 'maya'
  data.integrationLogs[0].handledAt = new Date().toISOString()
  assert.deepEqual(workflow.closureIssues(data, 'Avrahami'), [])
  data.events.push({ id: 'ride', familyId: 'Avrahami', title: 'הסעה', date: localDate(2), time: '17:00', icon: '🚗', participantIds: ['yuval'], responsibleId: '', details: '', requiresDriver: true })
  data.acknowledgements.push({ eventId: 'ride', personId: 'yuval', signature: 'v1', status: 'pending' })
  assert.ok(workflow.closureIssues(data, 'Avrahami').some(issue => issue.includes('הסעות')))
  assert.ok(workflow.closureIssues(data, 'Avrahami').some(issue => issue.includes('אישורים')))
  data.events[0].responsibleId = 'adam'
  data.acknowledgements[0].status = 'approved'
  assert.deepEqual(workflow.closureIssues(data, 'Avrahami'), [])
})

test('שינוי קריטי או ביטול דורשים אישור לפני פעולה אוטומטית', () => {
  const data = structuredClone(initialData)
  const changed = structuredClone(data)
  changed.events.find(event => event.id === 'dentist').time = '11:30'
  assert.equal(workflow.sensitiveAutomaticChange(data, changed, 'Avrahami'), true)
  const cancelled = structuredClone(data)
  cancelled.events = cancelled.events.filter(event => event.id !== 'dance')
  assert.equal(workflow.sensitiveAutomaticChange(data, cancelled, 'Avrahami'), true)
  const ordinary = structuredClone(data)
  ordinary.events.find(event => event.id === 'dance').time = '17:30'
  assert.equal(workflow.sensitiveAutomaticChange(data, ordinary, 'Avrahami'), false)
})
