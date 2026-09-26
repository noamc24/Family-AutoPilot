import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: `export { conversationFor, clearLiaConversation, detectLiaIntent, performLiaChatAction, sendLiaChatMessage } from './src/liaChat.ts'; export { liaQuickPrompts } from './src/components/LiaChatPreview.tsx'; export { initialData, localDate, readData, sanitizeAppData } from './src/data.ts'; export { respondToRequest, confirmDriver, requestForEvent } from './src/coordination.ts';`,
    resolveDir: process.cwd(), sourcefile: 'lia-chat-test-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node',
})
const module = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url))
const { conversationFor, clearLiaConversation, detectLiaIntent, performLiaChatAction, sendLiaChatMessage, liaQuickPrompts, initialData, localDate, readData, respondToRequest, confirmDriver, requestForEvent } = module.exports

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

test('הודעת משתמש ותשובת ליה נשמרות לפי הסדר והודעה ריקה נזנחת', () => {
  const base = clone(initialData)
  const empty = sendLiaChatMessage(base, 'Avrahami', 'Mor', '   ')
  assert.equal(conversation(empty.data).messages.length, 0)
  const result = sendLiaChatMessage(base, 'Avrahami', 'Mor', 'מה יש לי היום?')
  const messages = conversation(result.data).messages
  assert.deepEqual(messages.map(item => item.sender), ['user', 'lia'])
  assert.match(messages[1].text, /הלו״ז שלך|אין לך אירועים/)
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
  assert.match(last(data).text, /10:30 · תור לרופא שיניים/)
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
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /עוד לא יודעת|על מה/)
})

test('לא מבטל pending suggestion בלי ליצור בקשה', () => {
  let data = sendLiaChatMessage(simpleData(), 'f', 'm', 'מי יכול לקחת את איתמר לחוג?').data
  data = sendLiaChatMessage(data, 'f', 'm', 'לא עכשיו').data
  assert.equal(data.transportationRequests.length, 0)
  assert.equal(conversationFor(data, 'f', 'm').contextState.pendingIntent, undefined)
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /לא שלחתי/)
  assert.equal(conversationFor(data, 'f', 'm').messages.find(item => item.action)?.status, 'dismissed')
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
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /אוראל לקח\/ה אחריות/)
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
  assert.match(conversationFor(data, 'f', 'm').messages.at(-1).text, /עוד לא יודעת לעשות את זה כאן/)
  const before = { events: data.events.length, tasks: data.tasks.length, activity: data.activity.length }
  data = clearLiaConversation(data, 'f', 'm')
  assert.equal(conversationFor(data, 'f', 'm').messages.length, 0)
  assert.deepEqual({ events: data.events.length, tasks: data.tasks.length, activity: data.activity.length }, before)
})

test('intent matching תומך בווריאציות ואינו דורש משפט מדויק', () => {
  assert.equal(detectLiaIntent('יש משהו שאני צריך לעשות?'), 'WHAT_NEEDS_ATTENTION')
  assert.equal(detectLiaIntent('מי פנוי להסיע את איתמר?'), 'WHO_CAN_DRIVE')
  assert.equal(detectLiaIntent('מה נשאר לעשות?'), 'OPEN_TASKS')
  assert.equal(detectLiaIntent('מה השתנה היום?'), 'RECENT_CHANGES')
})
