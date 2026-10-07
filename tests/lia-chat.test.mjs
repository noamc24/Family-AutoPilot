import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: `export { appendLiaTextReply, appendLiaUserMessage, canUseLegacyLiaFallback, conversationFor, clearLiaConversation, detectLiaIntent, fallbackLiaChatMessage, performLiaChatAction, sendLiaChatMessage } from './src/liaChat.ts'; export { liaQuickPrompts } from './src/components/LiaChatPreview.tsx'; export { initialData, localDate, readData, sanitizeAppData } from './src/data.ts'; export { respondToRequest, confirmDriver, requestForEvent } from './src/coordination.ts';`,
    resolveDir: process.cwd(), sourcefile: 'lia-chat-test-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const { appendLiaTextReply, appendLiaUserMessage, canUseLegacyLiaFallback, conversationFor, clearLiaConversation, detectLiaIntent, fallbackLiaChatMessage, performLiaChatAction, sendLiaChatMessage, liaQuickPrompts, initialData, localDate, readData, sanitizeAppData, respondToRequest, confirmDriver, requestForEvent } = module.exports

const clone = value => structuredClone(value)
const conversation = (data, memberId = 'Mor') => conversationFor(data, 'Avrahami', memberId)
const last = (data, memberId = 'Mor') => conversation(data, memberId).messages.at(-1)

function simpleData() {
  return {
    families: [{ id: 'f', name: 'משפחה', people: [
      { id: 'a', name: 'אוראל', role: 'אב', color: 'sage', age: 38, hasLicense: true, hasCar: true, availableForPickup: true, travelMinutes: 5, personalSettings: { notifications: { enabled: true }, lia: { proactiveSuggestions: true }, integrations: [{ sourceId: 'email', connectionStatus: 'disconnected', liaAccess: 'notAllowed', mode: 'demo' }] } },
      { id: 'm', name: 'מור', role: 'אם', color: 'peach', age: 35, hasLicense: true, hasCar: true, availableForPickup: true, travelMinutes: 35, personalSettings: { notifications: { enabled: true }, lia: { proactiveSuggestions: true }, integrations: [{ sourceId: 'email', connectionStatus: 'connected', liaAccess: 'allowed', mode: 'demo' }] } },
      { id: 'c', name: 'איתמר', role: 'בן', color: 'lavender', age: 9, hasLicense: false, hasCar: false, availableForPickup: false },
    ] }],
    events: [{ id: 'club', familyId: 'f', title: 'חוג של איתמר', date: localDate(), time: '17:00', icon: '⚽', participantIds: ['c'], responsibleId: '', details: '', requiresDriver: true }],
    tasks: [{ id: 'task', familyId: 'f', title: 'אישור הורים', ownerId: 'm', due: localDate(), done: false, priority: 'high' }],
    activity: [{ id: 'public', familyId: 'f', text: 'שעת החוג עודכנה', personIds: ['c'], source: 'family', createdAt: new Date().toISOString() }],
    transportationRequests: [], integrationLogs: [], calendarMirrors: [], acknowledgements: [], pendingActions: [], dismissedActionIds: [], trafficSignals: [], externalSignals: [],
    liaInterventions: [{ id: 'attention', familyId: 'f', type: 'coordination', title: 'נדרשת הסעה', detectedChange: 'עדיין אין נהג להסעה של איתמר.', whyItMatters: 'נדרש נהג.', recommendation: 'לשלוח בקשה.', sources: [{ sourceId: 'family', mode: 'demo' }], actions: [], status: 'decisionRequired', explanation: 'אין נהג משובץ.', relatedEventId: 'club', relatedMemberIds: ['c'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), visibility: { audience: 'family' } }],
    liaConversations: [],
  }
}

test('AI success stores one user message and exactly one LIA reply', () => {
  const optimistic = appendLiaUserMessage(simpleData(), 'f', 'm', 'מי את?', 'optimistic-1')
  const data = appendLiaTextReply(optimistic.data, 'f', 'm', 'אני LIA.')
  const messages = conversationFor(data, 'f', 'm').messages
  assert.deepEqual(messages.map(item => [item.sender, item.text]), [['user', 'מי את?'], ['lia', 'אני LIA.']])
})

test('AI failure replaces the optimistic message with one dictionary fallback exchange', () => {
  const optimistic = appendLiaUserMessage(simpleData(), 'f', 'm', 'מי את?', 'optimistic-2')
  const data = fallbackLiaChatMessage(optimistic.data, 'f', 'm', 'מי את?', optimistic.messageId)
  const messages = conversationFor(data, 'f', 'm').messages
  assert.deepEqual(messages.map(item => item.sender), ['user', 'lia'])
  assert.match(messages[1].text, /LIA|העוזרת המשפחתית/)
})

test('AI failure does not turn an unsupported mutation request into an unrelated legacy answer', () => {
  const base = simpleData()
  const before = { events: clone(base.events), tasks: clone(base.tasks), requests: clone(base.transportationRequests) }
  const input = 'תוסיפי לעומר משימה לסדר את החדר למחר'
  const optimistic = appendLiaUserMessage(base, 'f', 'm', input, 'unsafe-fallback')
  const data = fallbackLiaChatMessage(optimistic.data, 'f', 'm', input, optimistic.messageId)
  const messages = conversationFor(data, 'f', 'm').messages
  assert.equal(canUseLegacyLiaFallback(data, 'f', 'm', input), false)
  assert.equal(messages.at(-1).text, 'אני לא מצליחה לעבד את הבקשה כרגע. אפשר לנסות שוב בעוד רגע.')
  assert.doesNotMatch(messages.at(-1).text, /להכין תיק|משימות פתוחות/)
  assert.deepEqual({ events: data.events, tasks: data.tasks, requests: data.transportationRequests }, before)
})

test('AI failure still uses the deterministic fallback for a reliable legacy intent', () => {
  const input = 'איזה משימות נשארו להיום?'
  const optimistic = appendLiaUserMessage(simpleData(), 'f', 'm', input, 'safe-fallback')
  const data = fallbackLiaChatMessage(optimistic.data, 'f', 'm', input, optimistic.messageId)
  assert.equal(canUseLegacyLiaFallback(data, 'f', 'm', input), true)
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /אישור הורים|משימות/)
})

test('AI-only action acknowledgement cannot mutate application state', () => {
  const base = simpleData()
  const before = { events: clone(base.events), requests: clone(base.transportationRequests), tasks: clone(base.tasks) }
  const optimistic = appendLiaUserMessage(base, 'f', 'm', 'תעבירי את החוג של איתמר לשש', 'optimistic-3')
  const data = appendLiaTextReply(optimistic.data, 'f', 'm', 'הבנתי שמדובר בשינוי השעה, אבל כרגע איני יכולה לבצע אותו.')
  assert.deepEqual(data.events, before.events)
  assert.deepEqual(data.transportationRequests, before.requests)
  assert.deepEqual(data.tasks, before.tasks)
})

test('הודעת משתמש ותשובת ליה נשמרות לפי הסדר והודעה ריקה נזנחת', () => {
  const base = clone(initialData)
  const empty = sendLiaChatMessage(base, 'Avrahami', 'Mor', '   ')
  assert.equal(conversation(empty.data).messages.length, 0)
  const result = sendLiaChatMessage(base, 'Avrahami', 'Mor', 'מה יש לי היום?')
  const messages = conversation(result.data).messages
  assert.deepEqual(messages.map(item => item.sender), ['user', 'lia'])
  assert.match(messages[1].text, /הלו״ז שלך|הלו״ז של מור|אין לך אירועים/)
})

test('שיחות מבודדות לפי Member ומעבר ביניהם מחזיר את ההיסטוריה הנכונה', () => {
  let data = sendLiaChatMessage(clone(initialData), 'Avrahami', 'Mor', 'מה יש לי היום?').data
  data = sendLiaChatMessage(data, 'Avrahami', 'Orel', 'איזה משימות פתוחות יש לי?').data
  assert.match(conversation(data, 'Mor').messages[0].text, /היום/)
  assert.match(conversation(data, 'Orel').messages[0].text, /משימות/)
  assert.equal(conversation(data, 'Itamar').messages.length, 0)
})

test('conversation נשמר ב-AppData ונטען מחדש דרך persistence', () => {
  const originalStorage = globalThis.localStorage
  const data = sendLiaChatMessage(clone(initialData), 'Avrahami', 'Mor', 'מה יש לי היום?').data
  globalThis.localStorage = { getItem: key => key === 'family-autopilot-he-v1' ? JSON.stringify(data) : null }
  try { assert.equal(conversation(readData()).messages.length, 2) }
  finally { globalThis.localStorage = originalStorage }
})

test('quick prompt עובר באותו send flow ומחזיר נתוני אירועים אמיתיים', () => {
  const data = sendLiaChatMessage(clone(initialData), 'Avrahami', 'Mor', liaQuickPrompts[1]).data
  assert.equal(conversation(data).messages[0].text, liaQuickPrompts[1])
  assert.match(last(data).text, /אין לך אירועים כרגע/)
})

test('TODAY_SCHEDULE ו-OPEN_TASKS נקראים מה-events וה-tasks האמיתיים', () => {
  let data = simpleData()
  data = sendLiaChatMessage(data, 'f', 'm', 'מה יש היום?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /חוג של איתמר/)
  data = sendLiaChatMessage(data, 'f', 'm', 'איזה משימות פתוחות יש לי?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /אישור הורים/)
})

test('WHAT_NEEDS_ATTENTION משתמש ב-interventions ובמשימות אמיתיים', () => {
  const data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מה דורש טיפול היום?').data
  const text = conversationFor(data, 'f', 'm').messages.at(-1).text
  assert.match(text, /עדיין אין נהג להסעה של איתמר/)
  assert.match(text, /אישור הורים/)
})

test('WHO_CAN_DRIVE משתמש ב-eligibility וב-rankedDrivers הקיימים', () => {
  const data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול לקחת את איתמר לחוג?').data
  const chat = conversationFor(data, 'f', 'm')
  assert.match(chat.messages.at(-1).text, /אוראל.*מתאים/)
  assert.equal(chat.contextState.pendingIntent.suggestedMemberId, 'a')
  assert.equal(chat.messages.at(-1).action.kind, 'sendRideRequest')
})

test('כן עם context וכפתור הפעולה מפעילים אותה פונקציה ויוצרים request קיים', () => {
  const suggested = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול לקחת את איתמר לחוג?').data
  const typed = sendLiaChatMessage(clone(suggested), 'f', 'm', 'כן').data
  const clicked = performLiaChatAction(clone(suggested), conversationFor(suggested, 'f', 'm'), 'm').data
  const typedRequest = requestForEvent(typed, 'club')
  const clickedRequest = requestForEvent(clicked, 'club')
  assert.ok(typedRequest)
  assert.ok(clickedRequest)
  assert.deepEqual(typedRequest.eligibleMemberIds, clickedRequest.eligibleMemberIds)
  assert.match(conversationFor(typed, 'f', 'm').messages.at(-1).text, /שלחתי.*אוראל/)
})

test('כן ללא pending אינו מבצע פעולה ולא מבקש הסעה', () => {
  const data = sendLiaChatMessage(simpleData(), 'f', 'm', 'כן').data
  assert.equal(data.transportationRequests.length, 0)
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /לא בטוחה שהבנתי|על מה/)
})

test('לא מבטל pending suggestion בלי ליצור בקשה', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול לקחת את איתמר לחוג?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'לא עכשיו').data
  assert.equal(data.transportationRequests.length, 0)
  assert.equal(conversationFor(data, 'f', 'm').contextState.pendingIntent, undefined)
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /לא שלחתי/)
  assert.equal(conversationFor(data, 'f', 'm').messages.find(item => item.action)?.status, 'dismissed')
})

test('normalization מבטלת פעולת chat שהתייתמה לאחר מחיקת אירוע או Member', () => {
  const suggested = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול לקחת את איתמר לחוג?').data
  const withoutEvent = sanitizeAppData({ ...clone(suggested), events: [] })
  const eventConversation = conversationFor(withoutEvent, 'f', 'm')
  assert.equal(eventConversation.contextState.pendingIntent, undefined)
  assert.equal(eventConversation.contextState.lastEventId, undefined)
  assert.equal(eventConversation.messages.find(item => item.action)?.status, 'failed')
  assert.equal(performLiaChatAction(withoutEvent, eventConversation, 'm').success, false)

  const withoutDriver = clone(suggested)
  withoutDriver.families[0].people = withoutDriver.families[0].people.filter(person => person.id !== 'a')
  const memberConversation = conversationFor(sanitizeAppData(withoutDriver), 'f', 'm')
  assert.equal(memberConversation.contextState.pendingIntent, undefined)
  assert.equal(memberConversation.contextState.lastMemberId, undefined)
  assert.equal(memberConversation.messages.find(item => item.action)?.status, 'failed')
})

test('סטטוס הסעה נקרא מה-state הנוכחי לאחר אישור מחוץ לצ׳אט', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול לקחת את איתמר לחוג?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'כן').data
  const chat = conversationFor(data, 'f', 'm')
  const target = chat.contextState.lastMemberId
  const request = requestForEvent(data, 'club')
  data = respondToRequest(data, request.id, target, 'CAN_DO')
  data = confirmDriver(data, request.id, target)
  data = sendLiaChatMessage(data, 'f', 'm', 'מה קרה עם ההסעה?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /ההסעה.*מכוסה.*אוראל אחראי/)
})

test('liaAccess חוסם מקור פרטי ו-raw payload אינו נחשף', () => {
  const base = simpleData()
  base.integrationLogs.unshift({ id: 'private', familyId: 'f', scenarioKey: 'private', source: 'email', sourceText: 'PRIVATE_RAW_EMAIL_SECRET', action: 'נוסף עדכון בטוח למשפחה', personIds: ['m'], createdAt: new Date().toISOString(), privacy: { ownerId: 'm', rawVisibility: 'private', familyInsight: 'עדכון בטוח' } })
  let data = sendLiaChatMessage(base, 'f', 'a', 'מה השתנה?').data
  assert.doesNotMatch(conversationFor(data, 'f', 'a').messages.at(-1).text, /PRIVATE_RAW_EMAIL_SECRET/)
  data = sendLiaChatMessage(base, 'f', 'm', 'מה השתנה?').data
  assert.doesNotMatch(conversationFor(data, 'f', 'm').messages.at(-1).text, /PRIVATE_RAW_EMAIL_SECRET/)
})

test('child mode מוגבל למידע אישי ואינו מקבל פעולת הסעה', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'c', 'מה דורש טיפול היום?').data
  assert.match(conversationFor(data, 'f', 'c').messages.at(-1).text, /במצב ילד/)
  data = sendLiaChatMessage(data, 'f', 'c', 'מי יכול לקחת את איתמר לחוג?').data
  assert.equal(conversationFor(data, 'f', 'c').messages.at(-1).action, undefined)
  assert.doesNotMatch(conversationFor(data, 'f', 'c').messages.at(-1).text, /אישור הורים/)
})

test('fallback קצר ו-clear chat מנקה רק את השיחה', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'תזמיני לי פיצה').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /לא בטוחה שהבנתי/)
  const before = { events: data.events.length, tasks: data.tasks.length, activity: data.activity.length }
  data = clearLiaConversation(data, 'f', 'm')
  assert.equal(conversationFor(data, 'f', 'm').messages.length, 0)
  assert.deepEqual({ events: data.events.length, tasks: data.tasks.length, activity: data.activity.length }, before)
})

test('intent matching תומך בווריאציות ואינו דורש משפט מדויק', () => {
  assert.equal(detectLiaIntent('יש אירוע שאני צריך לעשות?'), 'WHAT_NEEDS_ATTENTION')
  assert.equal(detectLiaIntent('מי פנוי להסיע את איתמר?'), 'WHO_CAN_DRIVE')
  assert.equal(detectLiaIntent('מה נשאר לעשות?'), 'OPEN_TASKS')
  assert.equal(detectLiaIntent('מה השתנה היום?'), 'RECENT_CHANGES')
  assert.equal(detectLiaIntent('מה נשאר להיום?'), 'TODAY_SCHEDULE')
  assert.equal(detectLiaIntent('יש אירוע חשוב?'), 'WHAT_NEEDS_ATTENTION')
  assert.equal(detectLiaIntent('מה יש מחר?'), 'UPCOMING_EVENTS')
  assert.equal(detectLiaIntent('מתי האימון?'), 'EVENT_DETAILS')
})

test('follow-up מחליף נהג לפי שם ושולח את הפעולה הקיימת לנמען החדש', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול להסיע את איתמר?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'ומה עם מור?').data
  let chat = conversationFor(data, 'f', 'm')
  assert.equal(chat.contextState.lastMemberId, 'm')
  assert.equal(chat.contextState.pendingIntent.suggestedMemberId, 'm')
  assert.match(chat.messages.at(-1).text, /מור פנויה/)
  data = sendLiaChatMessage(data, 'f', 'm', 'אז תשלחי לה').data
  chat = conversationFor(data, 'f', 'm')
  assert.match(chat.messages.at(-1).text, /שלחתי.*מור/)
  assert.equal(requestForEvent(data, 'club').responses.m, 'PENDING')
})

test('אירוע שכבר מכוסה מחזיר סטטוס ואינו מציג פעולת בקשה שעתידה להיכשל', () => {
  const data = simpleData()
  data.events[0].date = localDate(1)
  data.events[0].responsibleId = 'a'
  data.transportationRequests.push({ id: 'stale-open', familyId: 'f', eventId: 'club', passengerId: 'c', eligibleMemberIds: ['a', 'm'], responses: { a: 'PENDING', m: 'PENDING' }, selectedDriverId: '', status: 'OPEN', createdById: 'm', origin: 'בית', destination: 'חוג', requiredAt: `${localDate()}T17:00` })
  const next = sendLiaChatMessage(data, 'f', 'm', 'מי יכול להסיע את איתמר?').data
  const message = conversationFor(next, 'f', 'm').messages.at(-1)
  assert.match(message.text, /אוראל כבר אחראי.*האיסוף מכוסה/)
  assert.equal(message.action, undefined)
  const withContext = sendLiaChatMessage(sendLiaChatMessage(data, 'f', 'm', 'מה יש השבוע?').data, 'f', 'm', 'אז מי כן?').data
  assert.equal(conversationFor(withContext, 'f', 'm').messages.at(-1).action, undefined)
})

test('למה משתמש בהקשר האחרון ו-fallback עם Member מציע הבהרה ממוקדת', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול להסיע את איתמר?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'למה?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /אוראל.*פנוי.*יכול.*לנהוג/)
  data = sendLiaChatMessage(data, 'f', 'm', 'תעשי אירוע עם מור').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /לגבי מור.*הסעה.*זמינות/)
})

test('מחר והשבוע מכבדים ניסוח טבעי וסינון לפי Member', () => {
  const data = simpleData()
  data.events.push(
    { ...data.events[0], id: 'mor-tomorrow', title: 'פגישה של מור', date: localDate(1), participantIds: ['m'], requiresDriver: false },
    { ...data.events[0], id: 'itamar-week', title: 'חוג מדעים של איתמר', date: localDate(2), participantIds: ['c'], requiresDriver: false },
  )
  let next = sendLiaChatMessage(data, 'f', 'm', 'מה יש לי מחר?').data
  assert.match(conversationFor(next, 'f', 'm').messages.at(-1).text, /פגישה של מור/)
  next = sendLiaChatMessage(next, 'f', 'm', 'ומה יש לאיתמר השבוע?').data
  const answer = conversationFor(next, 'f', 'm').messages.at(-1).text
  assert.match(answer, /חוג מדעים של איתמר/)
  assert.doesNotMatch(answer, /פגישה של מור/)
})

test('המשך זמן קצר שומר את נושא הלו״ז ואת בן המשפחה', () => {
  const base = simpleData()
  base.events.push({ ...base.events[0], id: 'tomorrow-club', title: 'חוג מדעים של איתמר', date: localDate(1), requiresDriver: false })
  base.events.push({ ...base.events[0], id: 'tomorrow-mor', title: 'פגישה של מור', date: localDate(1), participantIds: ['m'], requiresDriver: false })
  let data = sendLiaChatMessage(base, 'f', 'm', 'מה איתמר עושה היום?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'ומה מחר?').data
  const answer = conversationFor(data, 'f', 'm').messages.at(-1).text
  assert.match(answer, /חוג מדעים של איתמר/)
  assert.doesNotMatch(answer, /פגישה של מור/)
  assert.doesNotMatch(answer, /לא בטוחה למה התכוונת/)
})

test('שאלות סטטוס טבעיות שומרות את הקשר בקשת ההסעה ואינן מכפילות אותה', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול להסיע את איתמר?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'אז תשלחי לו').data
  assert.equal(data.transportationRequests.filter(request => request.eventId === 'club').length, 1)
  for (const prompt of ['שלחת?', 'למי שלחת?', 'מה הסטטוס?']) {
    data = sendLiaChatMessage(data, 'f', 'm', prompt).data
    assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /שלחתי|ממתינה|פתוחה/)
  }
  assert.equal(data.transportationRequests.filter(request => request.eventId === 'club').length, 1)
})

test('שאלות מקור, next, שעות וסיכום משולב מחזירות נתונים ולא fallback', () => {
  const base = simpleData()
  base.events[0].date = localDate(1)
  base.activity[0].createdAt = `${localDate()}T12:00:00.000Z`
  let data = sendLiaChatMessage(base, 'f', 'm', 'מה שינית היום?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'מאיזה מקור זה הגיע?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /התוכנית המשפחתית/)
  data = sendLiaChatMessage(data, 'f', 'm', 'מה האירוע הבא?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /האירוע הבא/)
  data = sendLiaChatMessage(data, 'f', 'm', 'מי פנוי בין 18:00 ל-20:00?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /בין 18:00 ל־20:00/)
  data = sendLiaChatMessage(data, 'f', 'm', 'תני לי ביחד אירועים, הסעות, משימות והחלטות').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /אירועים קרובים.*הסעות פתוחות.*משימות פתוחות.*החלטות/s)
})

test('פקודה עמומה, קרבת משפחה ומידע חי מקבלים הבהרה בלי ניחוש', () => {
  for (const [prompt, expected] of [['תעשי את זה', /לא ברור לי איזו פעולה/], ['ומה עם אחותו?', /לא בטוחה לאיזה בן או בת משפחה/], ['מה מזג האוויר עכשיו?', /אין לי גישה למידע חי/], ['מה כתבו עכשיו בוואטסאפ?', /לא תוכן פרטי|אין לי גישה/]]) {
    const data = sendLiaChatMessage(simpleData(), 'f', 'm', prompt).data
    assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, expected)
  }
})

test('LIA מנהלת שיחה טבעית עם ברכה, תודה ותמונת מצב על בן משפחה', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'היי').data
  assert.equal(conversationFor(data, 'f', 'm').messages.at(-1).text, 'היי מור. מה נבדוק?')
  data = sendLiaChatMessage(data, 'f', 'm', 'ספרי לי על איתמר').data
  const overview = conversationFor(data, 'f', 'm').messages.at(-1).text
  assert.match(overview, /אצל איתמר כרגע/)
  assert.match(overview, /חוג של איתמר/)
  data = sendLiaChatMessage(data, 'f', 'm', 'תודה רבה').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /בשמחה/)
})

test('שאלות המשך טבעיות משתמשות באירוע האחרון', () => {
  const base = simpleData()
  base.events[0].date = localDate(1)
  let data = sendLiaChatMessage(base, 'f', 'm', 'מה האירוע הבא?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'מתי זה?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/)
  data = sendLiaChatMessage(data, 'f', 'm', 'ומה אחר כך?').data
  assert.doesNotMatch(conversationFor(data, 'f', 'm').messages.at(-1).text, /לא בטוחה למה התכוונת/)
})

test('משימות בניסוח טבעי מסוננות לפי בן המשפחה שנשאל', () => {
  const data = simpleData()
  data.tasks.push({ id: 'orel-task', familyId: 'f', title: 'משימה של אוראל', ownerId: 'a', due: localDate(2), done: false })
  const next = sendLiaChatMessage(data, 'f', 'm', 'איזה משימות יש לאוראל?').data
  const answer = conversationFor(next, 'f', 'm').messages.at(-1).text
  assert.match(answer, /משימה של אוראל/)
  assert.doesNotMatch(answer, /אישור הורים/)
})

test('פרפראזות טבעיות על לו״ז מתכנסות לאותה כוונה ושומרות Member', () => {
  for (const prompt of ['מה איתמר עושה היום?', 'מה יש לאיתמר היום?', 'איתמר עסוק היום?', 'איפה איתמר צריך להיות היום?']) {
    const data = sendLiaChatMessage(simpleData(), 'f', 'm', prompt).data
    const chat = conversationFor(data, 'f', 'm')
    assert.match(chat.messages.at(-1).text, /לאיתמר יש חוג ב־17:00/)
    assert.equal(chat.contextState.lastMemberId, 'c')
  }
})

test('שיחה רציפה שומרת אירוע, אדם והסעה בין שאלות המשך', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מה איתמר עושה היום?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'מי מחזיר אותו?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /עדיין לא נקבע/)
  data = sendLiaChatMessage(data, 'f', 'm', 'מי יכול להחזיר במקום?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /אוראל.*מתאים/)
  data = sendLiaChatMessage(data, 'f', 'm', 'למה דווקא אוראל?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /אוראל.*פנוי.*יכול.*לנהוג/)
})

test('תיקון אדם ומעבר נושא מפעילים מחדש את הכוונה הקודמת', () => {
  const base = simpleData()
  base.families[0].people.push({ id: 'o', name: 'עומר', role: 'בן', color: 'gold', age: 6, hasLicense: false, hasCar: false, availableForPickup: false })
  base.events.push({ ...base.events[0], id: 'garden', title: 'מסיבת גן', participantIds: ['o'], time: '18:30', requiresDriver: false })
  let data = sendLiaChatMessage(base, 'f', 'm', 'מה איתמר עושה היום?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'לא איתמר, התכוונתי לעומר').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /מסיבת גן/)
  assert.equal(conversationFor(data, 'f', 'm').contextState.lastMemberId, 'o')
  data = sendLiaChatMessage(data, 'f', 'm', 'ומה עם מור?').data
  assert.equal(conversationFor(data, 'f', 'm').contextState.lastMemberId, 'm')
})

test('טווח ערב מסנן אירועים ואינו ממציא מידע חסר', () => {
  const base = simpleData()
  base.events.push({ ...base.events[0], id: 'morning', title: 'בדיקת בוקר', time: '09:00', requiresDriver: false })
  let data = sendLiaChatMessage(base, 'f', 'm', 'יש לאיתמר משהו בערב?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /חוג של איתמר/)
  assert.doesNotMatch(conversationFor(data, 'f', 'm').messages.at(-1).text, /בדיקת בוקר/)
  data = sendLiaChatMessage(data, 'f', 'm', 'איפה זה?').data
  assert.equal(conversationFor(data, 'f', 'm').messages.at(-1).text, 'אין לי מיקום שמור לאירוע הזה.')
})

test('הסבר נהג משתמש בסיבת פסילה אמיתית ומי עוד מתקדם במועמדים', () => {
  const base = simpleData()
  base.families[0].people[1].availability = 'work'
  let data = sendLiaChatMessage(base, 'f', 'm', 'מי יכול לקחת את איתמר?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'מור יכולה במקום?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /מור.*בעבודה/)
  data = sendLiaChatMessage(data, 'f', 'm', 'ומי עוד?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /אוראל.*יכול להתאים גם/)
})

test('שם אחרי לקחת את מזוהה כנוסע גם כשהאירוע כבר בהקשר', () => {
  const base = simpleData()
  base.events.push({ ...base.events[0], id: 'early-pickup', title: 'איסוף מוקדם של איתמר', time: '13:00' })
  let data = sendLiaChatMessage(base, 'f', 'm', 'מה איתמר עושה היום?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'מי יכול לקחת את איתמר לחוג?').data
  const answer = conversationFor(data, 'f', 'm').messages.at(-1).text
  assert.match(answer, /אוראל|מור/)
  assert.doesNotMatch(answer, /איתמר.*מתחת לגיל 18/)
  assert.equal(conversationFor(data, 'f', 'm').contextState.lastEventId, 'club')
})

test('what-if בודק בלי לשנות state ובקשת פעולה מחכה לאישור', () => {
  const base = simpleData()
  let data = sendLiaChatMessage(base, 'f', 'm', 'אם נעביר לאוראל זה מסתדר?').data
  assert.equal(data.transportationRequests.length, 0)
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /לא שיניתי דבר/)
  data = sendLiaChatMessage(data, 'f', 'm', 'תעבירי את ההסעה לאוראל').data
  assert.equal(data.transportationRequests.length, 0)
  assert.equal(conversationFor(data, 'f', 'm').messages.at(-1).type, 'actionRequest')
  data = sendLiaChatMessage(data, 'f', 'm', 'כן').data
  assert.ok(requestForEvent(data, 'club'))
})

test('משפחה ריקה מחזירה תשובה בטוחה ללא hallucination', () => {
  const empty = { families: [{ id: 'f', name: 'חדשה', people: [{ id: 'm', name: 'נועה', role: 'אם', color: 'sage', age: 30, hasLicense: false, hasCar: false, availableForPickup: false }] }], events: [], tasks: [], activity: [], transportationRequests: [], integrationLogs: [], calendarMirrors: [], liaConversations: [] }
  let data = sendLiaChatMessage(empty, 'f', 'm', 'מה יש לי היום?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /אין לך/)
  data = sendLiaChatMessage(data, 'f', 'm', 'מתי זה?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /לא מצאתי/)
})

test('שיחת שמונה תורות נשארת קוהרנטית ואז מחליפה נושא באופן טבעי', () => {
  const base = simpleData()
  base.families[0].people[1].availability = 'work'
  let data = base
  const ask = prompt => { data = sendLiaChatMessage(data, 'f', 'm', prompt).data; return conversationFor(data, 'f', 'm').messages.at(-1).text }
  assert.match(ask('מה איתמר עושה היום?'), /לאיתמר יש חוג ב־17:00/)
  assert.match(ask('ומה אחר כך?'), /אין.*נוסף/)
  assert.match(ask('מי מחזיר אותו?'), /עדיין לא נקבע/)
  assert.match(ask('מי יכול להחזיר במקום?'), /אוראל.*מתאים/)
  assert.match(ask('מור יכולה?'), /מור.*בעבודה/)
  assert.match(ask('למה לא?'), /מור.*בעבודה/)
  assert.match(ask('ומי עוד?'), /אין כרגע אפשרות נוספת|אוראל.*יכול להתאים גם/)
  assert.match(ask('לא משנה, מה מור צריכה לעשות היום?'), /אישור הורים/)
  assert.equal(conversationFor(data, 'f', 'm').contextState.lastMemberId, 'm')
})

test('החלטת LIA מהצ׳אט משתמשת ב-flow האמיתי ורק לאחר אישור', () => {
  const base = simpleData()
  base.events[0].responsibleId = 'm'
  base.liaInterventions[0] = { ...base.liaInterventions[0], type: 'traffic', actions: [{ id: 'approve', kind: 'approve', label: 'אישור', primary: true }, { id: 'dismiss', kind: 'dismiss', label: 'לא מתאים' }] }
  let data = sendLiaChatMessage(base, 'f', 'm', 'מה דורש ממני פעולה?').data
  const pending = conversationFor(data, 'f', 'm')
  assert.equal(pending.messages.at(-1).action.kind, 'liaDecision')
  assert.equal(data.liaInterventions[0].status, 'decisionRequired')
  data = sendLiaChatMessage(data, 'f', 'm', 'כן').data
  assert.equal(data.liaInterventions[0].status, 'completed')
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /עודכנה|בוצע/)
})

test('מצב ילד אינו חושף לו״ז של בן משפחה אחר דרך ניסוח שיחתי', () => {
  const data = sendLiaChatMessage(simpleData(), 'f', 'c', 'מה מור עושה היום?').data
  assert.match(conversationFor(data, 'f', 'c').messages.at(-1).text, /רק עם הלו״ז.*שלך/)
  assert.doesNotMatch(conversationFor(data, 'f', 'c').messages.at(-1).text, /עבודה/)
})

test('שאלת רמז אחרי רשימה מרובת אירועים מבקשת הבהרה במקום לנחש', () => {
  const base = simpleData()
  base.events.push({ ...base.events[0], id: 'second', title: 'מפגש חברים', time: '19:00', requiresDriver: false })
  let data = sendLiaChatMessage(base, 'f', 'm', 'מה איתמר עושה היום?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'מתי זה?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /הכוונה.*חוג של איתמר.*מפגש חברים/)
})

test('ניסוח שיחתי נשאר קצר, מכיר תיקון ואינו חוזר על הנושא', () => {
  const base = simpleData()
  base.families[0].people.push({ id: 'o', name: 'עומר', role: 'בן', color: 'gold', age: 6, hasLicense: false, hasCar: false, availableForPickup: false })
  base.events.push({ ...base.events[0], id: 'garden', title: 'מסיבת גן', participantIds: ['o'], time: '18:30', requiresDriver: false })
  let data = sendLiaChatMessage(base, 'f', 'm', 'מה איתמר עושה היום?').data
  const first = conversationFor(data, 'f', 'm').messages.at(-1).text
  assert.equal(first, 'לאיתמר יש חוג ב־17:00.')
  data = sendLiaChatMessage(data, 'f', 'm', 'לא איתמר, התכוונתי לעומר').data
  const corrected = conversationFor(data, 'f', 'm').messages.at(-1).text
  assert.match(corrected, /^כן — לעומר יש מסיבת גן ב־18:30/)
  assert.doesNotMatch(corrected, /התכוונת|תיקנתי|עדכנתי את ההקשר/)
})

test('סיבות נהיגה מתורגמות לעברית טבעית בלי מונחים פנימיים', () => {
  const base = simpleData()
  base.families[0].people[1].routines = [{ id: 'work', kind: 'work', label: 'עבודה', days: [new Date(`${localDate()}T12:00:00`).getDay()], start: '16:00', end: '19:00' }]
  let data = sendLiaChatMessage(base, 'f', 'm', 'מי יכול לקחת את איתמר?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'מור יכולה במקום?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'למה לא?').data
  const answer = conversationFor(data, 'f', 'm').messages.at(-1).text
  assert.match(answer, /מור.*עבודה.*באותה שעה/)
  assert.doesNotMatch(answer, /בלו״ז קבוע:|eligibility|conflict|עומד\/ת/)
})

test('ביטול שיחתי ואישור פעולה מקבלים acknowledgement טבעי', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול לקחת את איתמר?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'עזבי').data
  assert.equal(conversationFor(data, 'f', 'm').messages.at(-1).text, 'בסדר, עזבתי את זה.')
  assert.equal(conversationFor(data, 'f', 'm').contextState.pendingIntent, undefined)

  data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול לקחת את איתמר?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'כן').data
  assert.equal(conversationFor(data, 'f', 'm').messages.at(-1).text, 'סגור, שלחתי לאוראל. הבקשה ממתינה לתגובה.')
})

test('כוונות שיחה כלליות מכסות wellbeing, זהות, יכולות, עזרה וסיום', () => {
  const prompts = [
    ['מה שלומך?', /מעולה.*מה נבדוק/],
    ['מי את?', /העוזרת המשפחתית של FamPilot/],
    ['מה את יודעת לעשות?', /אירועים ומשימות.*הסעה.*התנגשויות/],
    ['איך משתמשים בך?', /מה יש היום.*משימות פתוחות.*מי פנוי להסעה/],
    ['יאללה ביי', /אני כאן כשתרצה להמשיך/],
  ]
  for (const [prompt, expected] of prompts) {
    const data = sendLiaChatMessage(simpleData(), 'f', 'm', prompt).data
    assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, expected)
  }
  for (const greeting of ['היי', 'היי LIA', 'שלום', 'בוקר טוב', 'מה קורה?', 'מה נשמע?']) {
    assert.match(detectLiaIntent(greeting), /GREETING|WELLBEING/)
  }
})

test('וריאציות שיחה ויכולת מסווגות סמנטית ולא לפי משפט יחיד', () => {
  for (const prompt of ['מה הולך', 'מה איתך', 'מה נשמע', 'מה שלומך', 'איך את', 'הכול טוב?']) {
    assert.equal(detectLiaIntent(prompt), 'WELLBEING')
  }
  for (const prompt of ['מה היכולות שלך', 'מה את יכולה לעשות', 'במה את עוזרת', 'איך את יכולה לעזור לי', 'מה אפשר לעשות איתך']) {
    assert.equal(detectLiaIntent(prompt), 'CAPABILITIES')
  }
})

test('שיחת חולין באמצע רצף אינה מאבדת אדם, אירוע או כוונה קודמת', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מה איתמר עושה היום?').data
  const before = conversationFor(data, 'f', 'm').contextState
  data = sendLiaChatMessage(data, 'f', 'm', 'סבבה תודה').data
  assert.equal(conversationFor(data, 'f', 'm').messages.at(-1).text, 'בשמחה.')
  const afterThanks = conversationFor(data, 'f', 'm').contextState
  assert.equal(afterThanks.lastMemberId, before.lastMemberId)
  assert.equal(afterThanks.lastEventId, before.lastEventId)
  assert.equal(afterThanks.lastIntent, before.lastIntent)
  data = sendLiaChatMessage(data, 'f', 'm', 'ומי מחזיר אותו?').data
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /עדיין לא נקבע/)
  data = sendLiaChatMessage(data, 'f', 'm', 'אלופה').data
  assert.equal(conversationFor(data, 'f', 'm').messages.at(-1).text, 'תמיד 🙂')
})

test('fallback שיחתי משתמש בנושא האחרון בלי להמציא עובדות', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מה איתמר עושה היום?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'תעשי קסם קטן').data
  const answer = conversationFor(data, 'f', 'm').messages.at(-1).text
  assert.match(answer, /לא בטוחה למה התכוונת לגבי איתמר.*לאירוע.*להסעה/)
  assert.doesNotMatch(answer, /מצאתי|קבעתי|עדכנתי/)
})

function richDialogueData() {
  const data = simpleData()
  const weekday = new Date(`${localDate()}T12:00:00`).getDay()
  data.families[0].people[1].routines = [{ id: 'mor-course', kind: 'study', label: 'קורס', days: [weekday], start: '16:00', end: '20:00' }]
  data.families[0].people.push({ id: 'o', name: 'עומר', role: 'בן', color: 'gold', age: 6, hasLicense: false, hasCar: false, availableForPickup: false })
  data.events.push(
    { ...data.events[0], id: 'omer-evening', title: 'מסיבת גן', date: localDate(1), time: '18:30', participantIds: ['o'], requiresDriver: false },
    { ...data.events[0], id: 'itamar-tomorrow', title: 'אימון כדורסל', date: localDate(1), time: '19:00', participantIds: ['c'], requiresDriver: false },
  )
  return data
}

const runDialogue = (base, prompts) => {
  let data = base
  const answers = []
  for (const prompt of prompts) {
    data = sendLiaChatMessage(data, 'f', 'm', prompt).data
    answers.push(conversationFor(data, 'f', 'm').messages.at(-1).text)
  }
  return { data, answers, context: conversationFor(data, 'f', 'm').contextState }
}

test('stress A: סלנג, יכולות, שאלה משפחתית ופעולת הסעה נשארים שיחה אחת', () => {
  const prompts = ['אהלן', 'מה הולך?', 'מה היכולות שלך?', 'סבבה', 'מה איתמר עושה היום?', 'ומי מחזיר אותו?', 'תודה אלופה', 'ומור יכולה במקום?', 'למה לא?', 'מי כן?', 'עזבי, אוראל טוב']
  const { data, answers, context } = runDialogue(richDialogueData(), prompts)
  assert.match(answers[1], /מעולה|אני כאן/)
  assert.match(answers[2], /אירועים ומשימות/)
  assert.match(answers[4], /איתמר.*חוג|יש לו.*חוג/)
  assert.match(answers[7], /מור.*קורס|מור.*לא פנויה/)
  assert.match(answers[8], /מור.*קורס/)
  assert.ok(requestForEvent(data, 'club'))
  assert.equal(context.pendingIntent, undefined)
})

test('stress B: תיקוני זמן ואדם, ellipsis והבהרת פרטי אירוע', () => {
  const prompts = ['מה יש לעומר מחר?', 'בערב התכוונתי', 'מי איתו?', 'לא עומר, איתמר', 'אוקיי', 'ואחר כך?', 'מתי?', 'איפה?', 'זה הכל?', 'תודה']
  const { answers, context } = runDialogue(richDialogueData(), prompts)
  assert.match(answers[0], /מסיבת גן/)
  assert.match(answers[1], /מסיבת גן/)
  assert.match(answers[2], /עומר|משתתפים/)
  assert.match(answers[3], /איתמר|אימון כדורסל/)
  assert.doesNotMatch(answers.join('\n'), /לא זוהתה כוונה|undefined|\[object Object\]/)
  assert.equal(context.lastMemberId, 'c')
})

test('stress C: pending action שורד הסבר וחלופות ומתבטל רק מבקשה מפורשת', () => {
  const prompts = ['מי יכול לקחת את איתמר?', 'למה אוראל?', 'ומי עוד?', 'אם אוראל לא יכול?', 'אז מור?', 'רגע היא בקורס לא?', 'נכון, עזבי', 'מה קרה עם ההסעה?', 'סבבה', 'ביי']
  const { data, answers, context } = runDialogue(richDialogueData(), prompts)
  assert.ok(answers.slice(1, 6).every(answer => !/לא בטוחה שהבנתי/.test(answer)))
  assert.match(answers[5], /מור.*קורס|מור.*לא פנויה/)
  assert.match(answers[6], /עזבתי|לא שלחתי|לא ביצעתי/)
  assert.equal(data.transportationRequests.length, 0)
  assert.equal(context.pendingIntent, undefined)
})

test('stress D: מעבר בין בני משפחה וחזרה לנושא קודם משחזרים הקשר מובנה', () => {
  const prompts = ['מה איתמר עושה היום?', 'ומה עם מור?', 'איזה משימות יש לה?', 'מה איתך?', 'חחח', 'רגע נחזור לאיתמר', 'מתי?', 'ומי מחזיר אותו?', 'איפה היינו?', 'תודה']
  const { answers, context } = runDialogue(richDialogueData(), prompts)
  assert.match(answers[0], /איתמר/)
  assert.match(answers[2], /אישור הורים/)
  assert.match(answers[5], /חזרנו לאיתמר/)
  assert.match(answers[6], /\d{2}\/\d{2}\/\d{4}.*17:00/)
  assert.match(answers[7], /עדיין לא נקבע/)
  assert.equal(context.lastMemberId, 'm')
})

test('stress E: clarification מסודר ו-context ישן אינו מנחש אירוע', () => {
  const base = richDialogueData()
  base.events.push({ ...base.events[0], id: 'friends', title: 'מפגש חברים', time: '19:30', requiresDriver: false })
  let data = base
  for (const prompt of ['מה איתמר עושה היום?', 'מתי?', 'השני']) data = sendLiaChatMessage(data, 'f', 'm', prompt).data
  let chat = conversationFor(data, 'f', 'm')
  const liaAnswers = chat.messages.filter(message => message.sender === 'lia')
  assert.match(liaAnswers.at(-3).text, /חוג.*מפגש חברים/s)
  assert.match(liaAnswers.at(-2).text, /הכוונה.*או/)
  assert.match(liaAnswers.at(-1).text, /מפגש חברים.*19:30/)
  for (let index = 0; index < 13; index += 1) data = sendLiaChatMessage(data, 'f', 'm', index % 2 ? 'סבבה' : 'חחח').data
  data = sendLiaChatMessage(data, 'f', 'm', 'איפה?').data
  chat = conversationFor(data, 'f', 'm')
  assert.match(chat.messages.at(-1).text, /לא מצאתי את האירוע|אפשר לכתוב את שמו/)
  assert.doesNotMatch(chat.messages.at(-1).text, /מפגש חברים|חוג של איתמר/)
})
