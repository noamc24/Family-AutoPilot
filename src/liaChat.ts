import { createRequest, eligibleDrivers, ensureRequests, rankedDrivers, requestForEvent } from './coordination'
import { dateLabel, localDate, uid, type AppData, type FamilyEvent, type Person } from './data'
import { buildLiaInterventions } from './liaInterventions'
import type { LiaChatAction, LiaConversation, LiaMessage, LiaPendingIntent } from './liaChatTypes'

export type LiaChatIntent = 'WHAT_NEEDS_ATTENTION' | 'TODAY_SCHEDULE' | 'UPCOMING_EVENTS' | 'EVENT_DETAILS' | 'WHO_CAN_DRIVE' | 'MEMBER_AVAILABILITY' | 'OPEN_TASKS' | 'RECENT_CHANGES' | 'ALREADY_HANDLED' | 'SEND_RIDE_REQUEST' | 'EXPLAIN' | 'RIDE_STATUS' | 'HELP' | 'UNSUPPORTED'

const normalize = (value: string) => value.trim().toLowerCase().normalize('NFKD').replace(/[\u0591-\u05c7]/g, '').replace(/[?!.,:;׳״'\"()-]/g, ' ').replace(/\s+/g, ' ').trim()
const has = (text: string, expressions: RegExp[]) => expressions.some(expression => expression.test(text))
const affirmative = [/^כן$/, /יאללה/, /תשלחי/, /שלחי/, /תשלח/, /סבבה/, /קדימה/, /אז .*שלח/]
const negative = [/^לא$/, /עזבי/, /לא עכשיו/, /ביטול/, /תבטלי/, /בטלי/]

export function detectLiaIntent(input: string, pending?: LiaPendingIntent): LiaChatIntent {
  const text = normalize(input)
  if (pending && has(text, affirmative)) return 'SEND_RIDE_REQUEST'
  if (pending && has(text, negative)) return 'SEND_RIDE_REQUEST'
  if (has(text, [/^(למה|איך את יודעת)/, /^למה (הוא|היא|זה)/])) return 'EXPLAIN'
  if (has(text, [/מה קרה עם .*הסע/, /מה מצב .*הסע/, /הסעה.*אושר/, /מי (לוקח|אוסף|מסיע)/])) return 'RIDE_STATUS'
  if (has(text, [/מה דורש טיפול/, /מה פתוח/, /צריך .*לטפל/, /יש משהו חשוב/, /צריך לעשות/, /דורש תשומת לב/, /מה דחוף/])) return 'WHAT_NEEDS_ATTENTION'
  if (has(text, [/מה יש לי היום/, /מה קורה היום/, /מה נשאר להיום/, /הלוז שלי/, /לוז שלי/, /לוח שלי היום/, /מה יש היום/, /לוח.*היום/, /אירועים היום/, /מה יש ל.*היום/])) return 'TODAY_SCHEDULE'
  if (has(text, [/מה יש מחר/, /מה יש בהמשך/, /אירועים קרובים/, /מה צפוי/, /השבוע/])) return 'UPCOMING_EVENTS'
  if (has(text, [/מתי .*?(אימון|חוג|אירוע|תור)/, /מתי האימון/])) return 'EVENT_DETAILS'
  if (has(text, [/מי יכול.*(לקחת|להסיע|לאסוף)/, /מי פנוי.*(לקחת|להסיע|לאסוף)/, /מישהו.*(לקחת|להסיע)/, /מי יכול במקום/])) return 'WHO_CAN_DRIVE'
  if (has(text, [/^ומה עם /, /^מה עם /, /מי פנוי/, /פנוי(?:ה)?(?: ב| )?\d/, /האם .* פנוי/, /.* פנוי(?:ה)?$/])) return 'MEMBER_AVAILABILITY'
  if (has(text, [/משימות.*(פתוחות|יש|נשאר)/, /יש משימות/, /מה נשאר לעשות/, /איזה משימות/, /עד יום/, /מה דחוף/])) return 'OPEN_TASKS'
  if (has(text, [/מה השתנה/, /מה קרה היום/, /עדכונים אחרונים/])) return 'RECENT_CHANGES'
  if (has(text, [/מה כבר טופל/, /מה (ליה|lia) .*טיפלה/, /מה כבר טיפלת/, /מה סגרת/])) return 'ALREADY_HANDLED'
  if (has(text, [/מה את יכולה/, /עזרה/, /אפשר לשאול/, /יכולות/])) return 'HELP'
  return 'UNSUPPORTED'
}

export function conversationFor(data: AppData, familyId: string, memberId: string): LiaConversation {
  const existing = (data.liaConversations || []).find(item => item.familyId === familyId && item.memberId === memberId)
  if (existing) return existing
  const timestamp = new Date().toISOString()
  return { id: uid(), familyId, memberId, messages: [], createdAt: timestamp, updatedAt: timestamp, contextState: {} }
}

function message(sender: 'user' | 'lia', text: string, type: LiaMessage['type'] = 'text', action?: LiaChatAction, relatedEntityIds?: string[]): LiaMessage {
  return { id: uid(), sender, type, text, createdAt: new Date().toISOString(), action, relatedEntityIds, status: 'sent' }
}

function saveConversation(data: AppData, conversation: LiaConversation): AppData {
  const conversations = (data.liaConversations || []).filter(item => item.id !== conversation.id && !(item.familyId === conversation.familyId && item.memberId === conversation.memberId))
  return { ...data, liaConversations: [...conversations, conversation] }
}

function visibleInterventions(data: AppData, familyId: string, member: Person, childMode: boolean) {
  return buildLiaInterventions(data, familyId).filter(item => {
    if (childMode && item.visibility.audience !== 'members') return false
    if (item.visibility.audience === 'members' && !item.visibility.memberIds?.includes(member.id)) return false
    return item.sources.every(source => {
      if (source.sourceId === 'family') return true
      const owner = source.ownerMemberId ? data.families.find(family => family.id === familyId)?.people.find(person => person.id === source.ownerMemberId) : member
      const integration = owner?.personalSettings?.integrations.find(entry => entry.sourceId === source.sourceId)
      return integration?.connectionStatus === 'connected' && integration.liaAccess === 'allowed'
    })
  })
}

function matchingEvent(data: AppData, familyId: string, input: string, conversation: LiaConversation): FamilyEvent | undefined {
  const family = data.families.find(item => item.id === familyId)
  const text = normalize(input)
  const named = family?.people.find(person => text.includes(person.name.toLowerCase()))
  const candidates = data.events.filter(event => event.familyId === familyId && event.date >= localDate() && event.requiresDriver && (!named || event.participantIds.includes(named.id)))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
  const open = candidates.filter(event => !event.responsibleId || !!requestForEvent(data, event.id) && requestForEvent(data, event.id)?.status !== 'COVERED')
  return open.find(event => text.split(' ').some(word => word.length > 2 && normalize(event.title).includes(word))) || open[0] || data.events.find(event => event.id === conversation.contextState?.lastEventId && (!event.responsibleId || requestForEvent(data, event.id)?.status !== 'COVERED'))
}

function driverOptions(data: AppData, event: FamilyEvent) {
  const request = requestForEvent(data, event.id) || createRequest(data, event, event.createdById || event.participantIds[0] || '')
  const eligible = new Set(eligibleDrivers(data, event).map(person => person.id))
  const simulated = { ...request, responses: Object.fromEntries(request.eligibleMemberIds.map(id => [id, 'CAN_DO' as const])) }
  return rankedDrivers(data, simulated).filter(option => eligible.has(option.person.id))
}

function shortList(items: string[]) { return items.length ? items.map(item => `• ${item}`).join('\n') : '' }

function responseFor(data: AppData, conversation: LiaConversation, member: Person, input: string, childMode: boolean): { text: string; type?: LiaMessage['type']; action?: LiaChatAction; context?: LiaConversation['contextState']; entities?: string[] } {
  const intent = detectLiaIntent(input, conversation.contextState?.pendingIntent)
  const family = data.families.find(item => item.id === conversation.familyId)!
  const context = { ...(conversation.contextState || {}), lastIntent: intent }

  if (intent === 'SEND_RIDE_REQUEST') {
    if (!context.pendingIntent) return { text: 'על מה תרצה שאעזור?', context }
    if (has(normalize(input), negative)) return { text: 'בסדר, לא שלחתי בקשה.', type: 'actionResult', context: { ...context, pendingIntent: undefined } }
    return { text: '', context }
  }
  if (intent === 'TODAY_SCHEDULE') {
    const personal = /לי|שלי/.test(normalize(input)) || childMode
    const named = family.people.find(person => normalize(input).includes(normalize(person.name)))
    const subjectId = named?.id || (personal ? member.id : undefined)
    const events = data.events.filter(event => event.familyId === family.id && event.date === localDate() && (!subjectId || event.participantIds.includes(subjectId) || event.responsibleId === subjectId)).sort((a, b) => a.time.localeCompare(b.time))
    return { text: events.length ? `${personal ? 'זה הלו״ז שלך להיום' : 'זה הלו״ז המשפחתי להיום'}:\n${shortList(events.slice(0, 5).map(event => `${event.time} · ${event.title}`))}` : personal ? 'אין לך אירועים כרגע—היום שלך פנוי.' : 'אין אירועים משפחתיים מתוכננים להיום.', type: 'entitySummary', entities: events.map(event => event.id), context }
  }
  if (intent === 'UPCOMING_EVENTS') {
    const tomorrow = normalize(input).includes('מחר')
    const events = data.events.filter(event => event.familyId === family.id && (tomorrow ? event.date === localDate(1) : event.date > localDate())).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)).slice(0, 4)
    return { text: events.length ? `${tomorrow ? 'מחר יש' : 'אלה האירועים הקרובים'}:\n${shortList(events.map(event => `${dateLabel(event.date)} ב־${event.time} · ${event.title}`))}` : tomorrow ? 'אין כרגע אירועים מתוכננים למחר.' : 'אין כרגע אירועים קרובים בתוכנית.', type: 'entitySummary', entities: events.map(event => event.id), context: { ...context, lastEventId: events[0]?.id } }
  }
  if (intent === 'EVENT_DETAILS') {
    const words = normalize(input).split(' ').filter(word => word.length > 2)
    const event = data.events.filter(item => item.familyId === family.id && item.date >= localDate()).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).find(item => words.some(word => normalize(item.title).includes(word)))
    return event ? { text: `${event.title} ${dateLabel(event.date)} ב־${event.time}.`, context: { ...context, lastEventId: event.id }, entities: [event.id] } : { text: 'לא מצאתי את האירוע הזה. אפשר לכתוב את שמו או לשאול מה יש היום.', context }
  }
  if (intent === 'OPEN_TASKS') {
    const tasks = data.tasks.filter(task => task.familyId === family.id && !task.done && (childMode || /לי|שלי/.test(normalize(input)) ? task.ownerId === member.id : true)).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5)
    return { text: tasks.length ? `אלה המשימות שעוד פתוחות:\n${shortList(tasks.map(task => `${task.title} · ${dateLabel(task.due)}`))}` : 'אין לך משימות פתוחות כרגע.', type: 'entitySummary', entities: tasks.map(task => task.id), context }
  }
  if (intent === 'WHAT_NEEDS_ATTENTION') {
    if (childMode) return { text: 'במצב ילד אני יכולה לעזור עם הלו״ז שלך, החוגים ומי אוסף אותך.', context }
    const interventions = visibleInterventions(data, family.id, member, false).filter(item => ['decisionRequired', 'waiting', 'owned', 'inProgress'].includes(item.status))
    const tasks = data.tasks.filter(task => task.familyId === family.id && !task.done && (task.priority === 'high' || task.priority === 'critical')).slice(0, 2)
    const rides = data.transportationRequests.filter(request => request.familyId === family.id && !['COVERED', 'CANCELLED'].includes(request.status)).slice(0, 2)
    const items = [...interventions.slice(0, 2).map(item => item.detectedChange), ...rides.map(request => `עדיין אין נהג מאושר ל־${data.events.find(event => event.id === request.eventId)?.title || 'הסעה'}`), ...tasks.map(task => `${task.title} עד ${dateLabel(task.due)}`)].slice(0, 4)
    return { text: items.length ? `יש כרגע ${items.length === 1 ? 'דבר אחד' : `${items.length} דברים`} שדורשים תשומת לב:\n${shortList(items)}` : 'הכול בשליטה כרגע. אין משהו שדורש ממך פעולה.', type: 'entitySummary', context: { ...context, lastInterventionId: interventions[0]?.id } }
  }
  if (intent === 'WHO_CAN_DRIVE') {
    if (childMode) {
      const event = matchingEvent(data, family.id, input, conversation)
      const request = event && requestForEvent(data, event.id)
      const driver = family.people.find(person => person.id === (request?.selectedDriverId || event?.responsibleId))
      return { text: driver && event ? `${driver.name} אחראי/ת כרגע להסעה ל־${event.title}.` : 'עדיין לא נקבע מי אוסף. מבוגר מהמשפחה יכול לטפל בזה.', context: { ...context, lastEventId: event?.id } }
    }
    const event = matchingEvent(data, family.id, input, conversation)
    if (!event) {
      const named = family.people.find(person => normalize(input).includes(normalize(person.name)))
      const covered = data.events.filter(item => item.familyId === family.id && item.date >= localDate() && item.requiresDriver && item.responsibleId && (!named || item.participantIds.includes(named.id))).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0]
      const driver = family.people.find(person => person.id === covered?.responsibleId)
      return driver && covered ? { text: `${driver.name} כבר אחראי/ת להסעה ל־${covered.title}. האיסוף מכוסה.`, context: { ...context, lastEventId: covered.id, lastMemberId: driver.id }, entities: [covered.id, driver.id] } : { text: 'לא מצאתי אירוע קרוב שדורש הסעה. אפשר לציין שם של אירוע או בן משפחה.', context }
    }
    const options = driverOptions(data, event)
    if (!options.length) return { text: `לא מצאתי כרגע נהג/ת כשיר/ה ופנוי/ה ל־${event.title}.`, context: { ...context, lastEventId: event.id } }
    const best = options[0]
    const alternative = options[1]
    const pendingIntent: LiaPendingIntent = { type: 'sendRideRequest', relatedEventId: event.id, suggestedMemberId: best.person.id, proposedAction: 'sendRideRequest' }
    return { text: `מצאתי את ${best.person.name} ${best.person.role === 'אם' || best.person.role === 'בת' ? 'פנויה ומתאימה' : 'פנוי ומתאים'} בזמן הזה.${alternative ? ` גם ${alternative.person.name} יכול/ה להתאים.` : ''}\nרוצה שאשלח ${best.person.role === 'אם' || best.person.role === 'בת' ? 'לה' : 'לו'} בקשה?`, type: 'actionRequest', action: { kind: 'sendRideRequest', label: 'שליחת בקשה', eventId: event.id, memberId: best.person.id }, entities: [event.id, best.person.id], context: { ...context, pendingIntent, lastEventId: event.id, lastMemberId: best.person.id } }
  }
  if (intent === 'MEMBER_AVAILABILITY') {
    const named = family.people.find(person => normalize(input).includes(person.name.toLowerCase()))
    if (!named) {
      const available = family.people.filter(person => person.age >= 18 && person.availableForPickup && person.availability !== 'unavailable')
      return { text: available.length ? `האנשים שמסומנים כפנויים כרגע: ${available.map(person => person.name).join(', ')}.` : 'לא מצאתי כרגע מבוגר שמסומן כפנוי.', context }
    }
    const event = matchingEvent(data, family.id, input, conversation)
    const available = event ? eligibleDrivers(data, event).some(person => person.id === named.id) : named.availableForPickup && named.availability !== 'unavailable'
    const feminine = named.role === 'אם' || named.role === 'בת'
    if (available && event && !childMode) {
      const pendingIntent: LiaPendingIntent = { type: 'sendRideRequest', relatedEventId: event.id, suggestedMemberId: named.id, proposedAction: 'sendRideRequest' }
      return { text: `${named.name} ${feminine ? 'פנויה' : 'פנוי'} בזמן הזה, ולא מצאתי התנגשות שמונעת את ההסעה. אפשר לשלוח ${feminine ? 'לה' : 'לו'} בקשה.`, type: 'actionRequest', action: { kind: 'sendRideRequest', label: 'שליחת בקשה', eventId: event.id, memberId: named.id }, entities: [event.id, named.id], context: { ...context, pendingIntent, lastMemberId: named.id, lastEventId: event.id } }
    }
    return { text: available ? `${named.name} ${feminine ? 'פנויה' : 'פנוי'} לפי הזמינות והלו״ז הקיימים.` : `${named.name} ${feminine ? 'לא פנויה' : 'לא פנוי'} לפי הזמינות או הלו״ז הקיימים.`, context: { ...context, pendingIntent: undefined, lastMemberId: named.id, lastEventId: event?.id || context.lastEventId } }
  }
  if (intent === 'RECENT_CHANGES') {
    const visibleSources = new Set(member.personalSettings?.integrations.filter(item => item.connectionStatus === 'connected' && item.liaAccess === 'allowed').map(item => item.sourceId) || [])
    const activity = data.activity.filter(item => item.familyId === family.id && (!childMode || item.personIds.includes(member.id)) && (!item.source || item.source === 'family' || visibleSources.has(item.source))).slice(0, 4)
    return { text: activity.length ? `אלה השינויים האחרונים שמצאתי:\n${shortList(activity.map(item => item.text))}` : 'לא מצאתי שינויים חדשים שרלוונטיים לך.', type: 'entitySummary', context }
  }
  if (intent === 'ALREADY_HANDLED') {
    if (childMode) return { text: 'אני יכולה לעדכן אותך לגבי האירועים והאיסופים שלך.', context }
    const handled = visibleInterventions(data, family.id, member, false).filter(item => ['completed', 'noAction'].includes(item.status)).slice(0, 4)
    return { text: handled.length ? `אלה הדברים שכבר טופלו:\n${shortList(handled.map(item => item.resolutionSummary || item.title))}` : 'לא מצאתי כרגע פעולות שסומנו כטופלו.', type: 'entitySummary', context }
  }
  if (intent === 'RIDE_STATUS') {
    const event = data.events.find(item => item.id === context.lastEventId) || matchingEvent(data, family.id, input, conversation)
    const request = event && requestForEvent(data, event.id)
    const driver = family.people.find(person => person.id === (request?.selectedDriverId || event?.responsibleId))
    if (driver && event) return { text: `מעולה, ${driver.name} לקח/ה אחריות על ${event.title}. האיסוף מכוסה.`, context: { ...context, pendingIntent: undefined, lastEventId: event.id } }
    if (request && context.lastMemberId && request.responses[context.lastMemberId] === 'PENDING') return { text: `שלחתי ל־${family.people.find(person => person.id === context.lastMemberId)?.name || 'בן המשפחה'}. אני עדיין ממתינה לתגובה.`, context }
    return { text: request ? 'בקשת ההסעה עדיין פתוחה וממתינה לתשובות.' : 'לא מצאתי בקשת הסעה פתוחה בהקשר הנוכחי.', context }
  }
  if (intent === 'EXPLAIN') {
    const intervention = visibleInterventions(data, family.id, member, childMode).find(item => item.id === context.lastInterventionId)
    if (intervention) return { text: intervention.explanation, context }
    const event = data.events.find(item => item.id === context.lastEventId)
    const person = family.people.find(item => item.id === context.lastMemberId)
    if (event && person) return { text: `כי ${person.name} עומד/ת בתנאי הנהיגה, מסומן/ת כזמין/ה ולא מצאתי התנגשות בלו״ז בזמן ${event.title}.`, context }
    return { text: 'אין לי כרגע המלצה קודמת שאפשר להסביר. אפשר לשאול מי פנוי להסעה.', context }
  }
  if (intent === 'HELP') return { text: childMode ? 'אני יכולה לעזור עם הלו״ז שלך, החוגים ומי אוסף אותך.' : 'אני יכולה לעזור עם הלו״ז, אירועים קרובים, משימות, הסעות, זמינות, שינויים ומה שדורש טיפול במשפחה.', context }
  const named = family.people.find(person => normalize(input).includes(normalize(person.name)))
  return { text: named ? `לא בטוחה מה רצית לבדוק לגבי ${named.name}. רוצה שאבדוק את הלו״ז, המשימות או ההסעות ${named.role === 'בן' || named.role === 'בת' ? 'שלו/ה' : 'שלו/ה'}?` : 'לא בטוחה למה התכוונת. רוצה שאבדוק את הלו״ז של היום, משימות פתוחות או הסעות?', context: { ...context, lastMemberId: named?.id || context.lastMemberId } }
}

export function performLiaChatAction(data: AppData, conversation: LiaConversation, memberId: string, pending = conversation.contextState?.pendingIntent): { data: AppData; conversation: LiaConversation; success: boolean } {
  if (!pending || pending.type !== 'sendRideRequest') return { data, conversation, success: false }
  const event = data.events.find(item => item.id === pending.relatedEventId)
  const family = data.families.find(item => item.id === conversation.familyId)
  const target = family?.people.find(item => item.id === pending.suggestedMemberId)
  if (!event || !target || !eligibleDrivers(data, event).some(person => person.id === target.id)) {
    const result = message('lia', 'לא הצלחתי לשלוח את הבקשה כי האירוע כבר לא קיים או שהנהג כבר לא פנוי.', 'actionResult')
    const next = { ...conversation, messages: [...conversation.messages.map(item => item.action?.kind === 'sendRideRequest' ? { ...item, status: 'failed' as const } : item), result], updatedAt: result.createdAt, contextState: { ...conversation.contextState, pendingIntent: undefined } }
    return { data: saveConversation(data, next), conversation: next, success: false }
  }
  const nextData = ensureRequests(data, memberId)
  const request = requestForEvent(nextData, event.id)
  if (!request) {
    const result = message('lia', 'לא הצלחתי לפתוח בקשת הסעה עבור האירוע הזה.', 'actionResult')
    const next = { ...conversation, messages: [...conversation.messages, result], updatedAt: result.createdAt, contextState: { ...conversation.contextState, pendingIntent: undefined } }
    return { data: saveConversation(data, next), conversation: next, success: false }
  }
  const result = message('lia', `סגור, שלחתי ל־${target.name} בקשה. אני ממתינה לתגובה ${target.role === 'אם' || target.role === 'בת' ? 'שלה' : 'שלו'}.`, 'actionResult', undefined, [request.id, event.id, target.id])
  const next = { ...conversation, messages: [...conversation.messages.map(item => item.action?.kind === 'sendRideRequest' ? { ...item, status: 'completed' as const } : item), result], updatedAt: result.createdAt, contextState: { ...conversation.contextState, pendingIntent: undefined, lastEventId: event.id, lastMemberId: target.id } }
  return { data: saveConversation(nextData, next), conversation: next, success: true }
}

export function sendLiaChatMessage(data: AppData, familyId: string, memberId: string, input: string): { data: AppData; conversation: LiaConversation } {
  const text = input.trim()
  let conversation = conversationFor(data, familyId, memberId)
  if (!text) return { data, conversation }
  const family = data.families.find(item => item.id === familyId)
  const member = family?.people.find(item => item.id === memberId)
  if (!family || !member) return { data, conversation }
  const userMessage = message('user', text)
  conversation = { ...conversation, messages: [...conversation.messages, userMessage], updatedAt: userMessage.createdAt }
  const intent = detectLiaIntent(text, conversation.contextState?.pendingIntent)
  if (intent === 'SEND_RIDE_REQUEST' && conversation.contextState?.pendingIntent && has(normalize(text), affirmative)) {
    return performLiaChatAction(saveConversation(data, conversation), conversation, memberId)
  }
  if (intent === 'SEND_RIDE_REQUEST' && conversation.contextState?.pendingIntent && has(normalize(text), negative)) {
    conversation = { ...conversation, messages: conversation.messages.map(item => item.action?.kind === 'sendRideRequest' ? { ...item, status: 'dismissed' as const } : item) }
  }
  const generated = responseFor(data, conversation, member, text, member.age < 18)
  const liaMessage = message('lia', generated.text, generated.type || 'text', generated.action, generated.entities)
  conversation = { ...conversation, messages: [...conversation.messages, liaMessage], updatedAt: liaMessage.createdAt, contextState: generated.context }
  return { data: saveConversation(data, conversation), conversation }
}

export function clearLiaConversation(data: AppData, familyId: string, memberId: string): AppData {
  return { ...data, liaConversations: (data.liaConversations || []).filter(item => item.familyId !== familyId || item.memberId !== memberId) }
}
