import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['src/data.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const model = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const chars = (...codes) => String.fromCharCode(...codes)

test('טעינה מתקנת סימני פיסוק פגומים בכל שדות הטקסט בלי למחוק נתונים', () => {
  const saved = structuredClone(model.initialData)
  const left = chars(0x201c)
  const right = chars(0x201d)
  const brokenQuote = chars(0x00e2, 0x20ac, 0x0153)
  const brokenApostrophe = chars(0x00e2, 0x20ac, 0x2122)
  const brokenDash = chars(0x00e2, 0x20ac, 0x201d)
  saved.families[0].name = `${left}משפחה${right}`
  saved.families[0].people[0].name = `אור${brokenApostrophe}אל`
  saved.events[0].title = `${brokenQuote}תור${right}`
  saved.events[0].details = `פגישה${chars(0x2026)} ${brokenDash} ${chars(0xfffd)}`
  saved.events[0].sourceNote = `${left}יומן${right}`
  saved.events[0].issueReason = `${left}עדכון${right}`
  saved.tasks[0].title = `${left}קניות${right}`
  saved.activity[0].text = `${left}תזכורת${right}`
  saved.integrationLogs.push({ id: 'log', familyId: 'Avrahami', scenarioKey: 'text', source: 'waze', sourceText: `${left}פקק${right}`, action: `זמן${chars(0x2013)}נסיעה`, personIds: ['adam'], createdAt: new Date().toISOString() })
  saved.transportationRequests.push({ id: 'request', familyId: 'Avrahami', eventId: 'pickup', passengerId: 'yuval', eligibleMemberIds: ['adam'], responses: { adam: 'PENDING' }, selectedDriverId: '', status: 'OPEN', createdById: 'adam', origin: `${left}בית${right}`, destination: `${left}חוג${right}`, requiredAt: `${model.localDate(4)}T18:30` })
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => JSON.stringify(saved) }
  try {
    const restored = model.readData()
    assert.equal(restored.families[0].name, '"משפחה"')
    assert.equal(restored.families[0].people[0].name, "אור'אל")
    assert.equal(restored.events[0].title, '"תור"')
    assert.equal(restored.events[0].details, 'פגישה... -')
    assert.equal(restored.events[0].sourceNote, '"יומן"')
    assert.equal(restored.events[0].issueReason, '"עדכון"')
    assert.equal(restored.tasks[0].title, '"קניות"')
    assert.equal(restored.activity[0].text, '"תזכורת"')
    assert.equal(restored.integrationLogs[0].sourceText, '"פקק"')
    assert.equal(restored.integrationLogs[0].action, 'זמן-נסיעה')
    assert.equal(restored.transportationRequests[0].origin, '"בית"')
    assert.equal(restored.transportationRequests[0].destination, '"חוג"')
    assert.equal(restored.events.length, saved.events.length)
    assert.equal(restored.tasks.length, saved.tasks.length)
  } finally { globalThis.localStorage = originalStorage }
})

test('עברית תקינה וגרש רגיל נשארים כפי שהיו', () => {
  const text = 'אוראל אמר: "אני יכול/ה". נצא ב-17:00.'
  assert.equal(model.cleanStoredText(text), text)
})
