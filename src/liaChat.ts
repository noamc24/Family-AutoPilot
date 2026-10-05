import { createRequest, eligibleDrivers, ensureRequests, rankedDrivers, requestForEvent } from './coordination'
import { dateLabel, localDate, uid, type AppData, type FamilyEvent, type Person } from './data'
import { buildLiaInterventions, type LiaActionKind } from './liaInterventions'
import { pickupIneligibility } from './domain'
import { applyTrafficFlowAction } from './liaCoreFlow'
import { applyShowcaseAction } from './showcaseFlows'
import { classifyLiaIntent, isAffirmative, isNegative, normalizeHebrew, resolveMember, temporalScope, type LiaIntent } from './liaLanguage'
import type { LiaChatAction, LiaConversation, LiaMessage, LiaPendingIntent } from './liaChatTypes'

export type LiaChatIntent = LiaIntent | 'TODAY_SCHEDULE' | 'UPCOMING_EVENTS' | 'MEMBER_AVAILABILITY' | 'OPEN_TASKS'

const normalize = (value: string) => value.trim().toLowerCase().normalize('NFKD').replace(/[\u0591-\u05c7]/g, '').replace(/[?!.,:;׳״'\"()-]/g, ' ').replace(/\s+/g, ' ').trim()
const has = (text: string, expressions: RegExp[]) => expressions.some(expression => expression.test(text))
const affirmative = [/^כן$/, /יאללה/, /תשלחי/, /שלחי/, /תשלח/, /סבבה/, /קדימה/, /אז .*שלח/]
const negative = [/^לא$/, /עזבי/, /לא עכשיו/, /ביטול/, /תבטלי/, /בטלי/]

export function detectLiaIntent(input: string, pending?: LiaPendingIntent): LiaChatIntent {
  const intent = classifyLiaIntent(input, pending)
  if (intent === 'SCHEDULE') return normalize(input).includes('היום') ? 'TODAY_SCHEDULE' : 'UPCOMING_EVENTS'
  if (intent === 'TASKS') return 'OPEN_TASKS'
  if (intent === 'AVAILABILITY') return 'MEMBER_AVAILABILITY'
  return intent
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
  const isOpenRide = (event: FamilyEvent) => {
    const request = requestForEvent(data, event.id)
    return !event.responsibleId && !request?.selectedDriverId && request?.status !== 'COVERED'
  }
  const open = candidates.filter(isOpenRide)
  return open.find(event => text.split(' ').some(word => word.length > 2 && normalize(event.title).includes(word))) || open[0] || data.events.find(event => event.id === conversation.contextState?.lastEventId && isOpenRide(event))
}

function driverOptions(data: AppData, event: FamilyEvent) {
  const request = requestForEvent(data, event.id) || createRequest(data, event, event.createdById || event.participantIds[0] || '')
  const eligible = new Set(eligibleDrivers(data, event).map(person => person.id))
  const simulated = { ...request, responses: Object.fromEntries(request.eligibleMemberIds.map(id => [id, 'CAN_DO' as const])) }
  return rankedDrivers(data, simulated).filter(option => eligible.has(option.person.id))
}

function shortList(items: string[]) { return items.length ? items.map(item => `• ${item}`).join('\n') : '' }
function isFeminine(person: Person) { return person.role === 'אם' || person.role === 'בת' }
function pronoun(person: Person) { return isFeminine(person) ? 'לה' : 'לו' }
function possessive(person: Person) { return isFeminine(person) ? 'שלה' : 'שלו' }
function naturalConstraint(person: Person, reason: string) {
  const feminine = isFeminine(person)
  if (reason.startsWith('בלו״ז קבוע: ')) return `${person.name} ${feminine ? 'לא פנויה' : 'לא פנוי'} — יש ${pronoun(person)} ${reason.replace('בלו״ז קבוע: ', '')} באותה שעה`
  if (reason === 'אירוע אחר באותה שעה') return `${person.name} ${feminine ? 'לא פנויה' : 'לא פנוי'} — יש ${pronoun(person)} אירוע אחר באותה שעה`
  if (reason === 'בעבודה בזמן האירוע' || reason === 'בעבודה') return `${person.name} בעבודה באותה שעה`
  if (reason === 'בנסיעה בזמן האירוע' || reason === 'בנסיעה') return `${person.name} בנסיעה באותה שעה`
  if (reason === 'ללא רישיון נהיגה') return `אין ל${person.name} רישיון נהיגה`
  if (reason === 'ללא גישה לרכב') return `אין ל${person.name} רכב זמין`
  if (reason === 'מתחת לגיל 18') return `${person.name} עדיין לא בגיל נהיגה`
  if (reason === 'לא זמין/ה לאיסוף') return `${person.name} ${feminine ? 'לא זמינה' : 'לא זמין'} לאיסוף`
  if (reason.includes('לא זמין/ה')) return `${person.name} ${feminine ? 'לא זמינה' : 'לא זמין'} בשעה הזו`
  return `${person.name} ${feminine ? 'לא מתאימה' : 'לא מתאים'} כרגע: ${reason}`
}
function scheduleLead(person: Person, established: boolean) { return established ? `יש ${pronoun(person)}` : `ל${person.name} יש` }
function correctionLead(corrected: boolean) { return corrected ? 'כן — ' : '' }
function titleForPerson(title: string, person: Person) {
  return title.replace(new RegExp(`\\s+(?:של\\s+|ל)${person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '')
}
const sourceLabels: Record<string, string> = { family: 'התוכנית המשפחתית', waze: 'Waze', calendar: 'Google Calendar', whatsapp: 'WhatsApp', school: 'בית הספר', email: 'אימייל', university: 'האוניברסיטה', weather: 'מזג האוויר' }
const clockMinutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute }
const overlaps = (start: string, end: string, from: string, to: string) => clockMinutes(start) < clockMinutes(to) && clockMinutes(from) < clockMinutes(end)
const oneHourAfter = (value: string) => { const total = clockMinutes(value) + 60; return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` }

function availableMembersBetween(data: AppData, familyId: string, date: string, from: string, to: string) {
  const family = data.families.find(item => item.id === familyId)
  const weekday = new Date(`${date}T12:00:00`).getDay()
  return (family?.people || []).filter(person => person.age >= 18 && person.availableForPickup && person.availability !== 'unavailable' &&
    !(person.routines || []).some(routine => (routine.days || [routine.day]).includes(weekday) && overlaps(routine.start, routine.end, from, to)) &&
    !data.events.some(event => event.familyId === familyId && event.date === date && (event.participantIds.includes(person.id) || event.responsibleId === person.id) && overlaps(event.time, event.endTime || oneHourAfter(event.time), from, to)))
}

const dayPartRange = (part?: string): [string, string] | undefined => part === 'morning' ? ['05:00', '12:00'] : part === 'afternoon' ? ['12:00', '17:00'] : part === 'evening' ? ['17:00', '22:00'] : part === 'night' ? ['22:00', '24:00'] : undefined
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }
function scopeDates(scope: ReturnType<typeof temporalScope>) {
  const today = localDate()
  if (scope.kind === 'today') return [today, today]
  if (scope.kind === 'tomorrow') return [localDate(1), localDate(1)]
  const weekday = new Date(`${today}T12:00:00`).getDay()
  if (scope.kind === 'week') return [today, addDays(today, 6 - weekday)]
  if (scope.kind === 'nextWeek') return [addDays(today, 7 - weekday), addDays(today, 13 - weekday)]
  return [today, '9999-12-31']
}
function scheduleEvents(data: AppData, familyId: string, memberId: string | undefined, scope: ReturnType<typeof temporalScope>) {
  const [from, to] = scopeDates(scope)
  const range = dayPartRange(scope.dayPart)
  return data.events.filter(event => event.familyId === familyId && event.date >= from && event.date <= to && (!memberId || event.participantIds.includes(memberId) || event.responsibleId === memberId) && (!range || event.time >= range[0] && event.time < range[1])).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
}
function routineFor(data: AppData, familyId: string, memberId: string, date: string, at?: string) {
  const person = data.families.find(item => item.id === familyId)?.people.find(item => item.id === memberId)
  const weekday = new Date(`${date}T12:00:00`).getDay()
  return (person?.routines || []).filter(routine => (routine.days || (routine.day === undefined ? [] : [routine.day])).includes(weekday) && (!at || routine.start <= at && at < routine.end)).sort((a, b) => a.start.localeCompare(b.start))
}
function eventReference(data: AppData, conversation: LiaConversation, input: string) {
  const familyEvents = data.events.filter(event => event.familyId === conversation.familyId)
  const text = normalize(input)
  const words = text.split(' ').filter(word => word.length > 2 && !['מתי', 'איפה', 'למה', 'אירוע', 'אחר', 'אחרי', 'לפני'].includes(word))
  const matched = familyEvents.find(event => words.some(word => normalize(event.title).includes(word))) || familyEvents.find(event => event.id === conversation.contextState?.lastEventId)
  if (matched) return matched
  const rideEvents = familyEvents.filter(event => event.requiresDriver && event.date >= localDate())
  return rideEvents.length === 1 ? rideEvents[0] : undefined
}
function naturalEvent(event: FamilyEvent) {
  const when = event.date === localDate() ? `היום ב־${event.time}` : event.date === localDate(1) ? `מחר ב־${event.time}` : `${dateLabel(event.date)} ב־${event.time}`
  return `${event.title} ${when}`
}
function memberRideReason(data: AppData, event: FamilyEvent, person: Person) {
  return pickupIneligibility(person, event, data)
}

function responseFor(data: AppData, conversation: LiaConversation, member: Person, input: string, childMode: boolean): { text: string; type?: LiaMessage['type']; action?: LiaChatAction; context?: LiaConversation['contextState']; entities?: string[] } {
  const family = data.families.find(item => item.id === conversation.familyId)!
  const semanticIntent = classifyLiaIntent(input, conversation.contextState?.pendingIntent, conversation.contextState?.lastIntent)
  const intent: LiaChatIntent = semanticIntent === 'SCHEDULE' ? (temporalScope(input, conversation.contextState?.temporalScope).kind === 'today' ? 'TODAY_SCHEDULE' : 'UPCOMING_EVENTS') : semanticIntent === 'TASKS' ? 'OPEN_TASKS' : semanticIntent === 'AVAILABILITY' ? 'MEMBER_AVAILABILITY' : semanticIntent
  const resolved = resolveMember(family, input, member, conversation.contextState)
  const scope = temporalScope(input, conversation.contextState?.temporalScope)
  const context = { ...(conversation.contextState || {}), previousIntent: conversation.contextState?.lastIntent, lastIntent: intent, temporalScope: scope, lastMemberId: resolved.member?.id || conversation.contextState?.lastMemberId }

  if (childMode && resolved.explicit && resolved.member && resolved.member.id !== member.id) return { text: 'במצב ילד אני יכולה לעזור רק עם הלו״ז, המשימות והאיסופים שלך.', context: { ...context, lastMemberId: member.id } }

  if (intent === 'GREETING') return { text: `היי ${member.name}. מה נבדוק?`, context }
  if (intent === 'THANKS') return { text: 'בשמחה.', context }
  if (intent === 'MEMBER_OVERVIEW') {
    const named = resolved.member || family.people.find(person => person.id === conversation.contextState?.lastMemberId)
    if (!named) return { text: 'על מי במשפחה רצית לשאול? אפשר לכתוב את השם ואבדוק את הלו״ז, המשימות וההסעות.', context }
    const events = scheduleEvents(data, family.id, named.id, { kind: 'upcoming' }).slice(0, 3)
    const tasks = data.tasks.filter(task => task.familyId === family.id && task.ownerId === named.id && !task.done).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3)
    const ride = events.find(event => event.requiresDriver)
    const request = ride && requestForEvent(data, ride.id)
    const routines = routineFor(data, family.id, named.id, localDate())
    const driverId = ride && (ride.responsibleId || request?.selectedDriverId)
    const driver = family.people.find(person => person.id === driverId)
    const lines = [events[0] ? `הדבר הבא: ${naturalEvent(events[0])}` : routines[0] ? `היום יש ${routines[0].label} עד ${routines[0].end}` : 'אין אירוע קרוב', tasks.length ? `${tasks.length === 1 ? 'משימה אחת פתוחה' : `${tasks.length} משימות פתוחות`}; הקרובה היא ${tasks[0].title}` : undefined, ride ? driver ? `${driver.name} אחראי/ת להסעה ל${ride.title}` : `עדיין צריך לסגור הסעה ל${ride.title}` : undefined].filter(Boolean) as string[]
    return { text: `אצל ${named.name} כרגע:\n${shortList(lines)}`, type: 'entitySummary', entities: [named.id, ...events.map(event => event.id), ...tasks.map(task => task.id)], context: { ...context, lastMemberId: named.id, lastEventId: events[0]?.id, lastTaskId: tasks[0]?.id, lastRideId: request?.id, lastResultIds: [...events.map(event => event.id), ...tasks.map(task => task.id)], referenceKind: 'member' } }
  }

  if (intent === 'SEND_RIDE_REQUEST') {
    if (!context.pendingIntent) return { text: 'על מה תרצה שאעזור?', context }
    if (has(normalize(input), negative)) return { text: /עזבי|לא משנה/.test(normalize(input)) ? 'בסדר, עזבתי את זה.' : context.pendingIntent.type === 'sendRideRequest' ? 'בסדר, לא שלחתי בקשה.' : 'בסדר, לא ביצעתי את הפעולה.', type: 'actionResult', context: { ...context, pendingIntent: undefined } }
    return { text: '', context }
  }
  if (intent === 'TODAY_SCHEDULE') {
    const personal = /(^| )(אני|לי|שלי)( |$)/.test(normalize(input)) || childMode
    const named = resolved.member || (personal ? member : undefined)
    const subjectId = named?.id
    const todayScope = { ...scope, kind: 'today' as const }
    const events = scheduleEvents(data, family.id, subjectId, todayScope)
    const routines = subjectId ? routineFor(data, family.id, subjectId, localDate()).filter(routine => { const range = dayPartRange(todayScope.dayPart); return !range || overlaps(routine.start, routine.end, range[0], range[1]) }) : []
    const heading = named ? `זה הלו״ז של ${named.name} להיום` : personal ? 'זה הלו״ז שלך להיום' : 'זה הלו״ז המשפחתי להיום'
    const items = [...routines.map(routine => ({ time: routine.start, text: `${routine.start}–${routine.end} · ${routine.label}` })), ...events.map(event => ({ time: event.time, text: `${event.time}${event.endTime ? `–${event.endTime}` : ''} · ${event.title}` }))].sort((a, b) => a.time.localeCompare(b.time))
    const empty = personal ? 'אין לך משהו מתוכנן כרגע—הזמן הזה פנוי.' : named ? `אין ל${named.name} משהו מתוכנן${scope.dayPart ? ' בזמן הזה' : ' להיום'}.` : 'אין אירועים משפחתיים מתוכננים להיום.'
    const established = !!named && conversation.contextState?.lastMemberId === named.id
    const responseText = events.length ? items.length === 1 && named ? `${correctionLead(resolved.correction)}${scheduleLead(named, established)} ${titleForPerson(events[0].title, named)} ב־${events[0].time}${events[0].endTime ? `–${events[0].endTime}` : ''}.` : items.length === 1 ? `${heading}: ${items[0].text}.` : `${correctionLead(resolved.correction)}${heading}:\n${shortList(items.slice(0, 6).map(item => item.text))}` : routines.length ? `${personal ? 'אין לך אירועים כרגע' : named ? `אין ל${named.name} אירועים כרגע` : 'אין אירועים כרגע'}. בלו״ז הקבוע: ${routines.map(routine => `${routine.label} ${routine.start}–${routine.end}`).join(', ')}.` : empty
    return { text: responseText, type: 'entitySummary', entities: events.map(event => event.id), context: { ...context, temporalScope: todayScope, lastMemberId: named?.id || context.lastMemberId, lastEventId: events[0]?.id, lastResultIds: events.map(event => event.id), referenceKind: events.length ? 'event' : 'member' } }
  }
  if (intent === 'UPCOMING_EVENTS') {
    const personal = /(^| )(אני|לי|שלי)( |$)/.test(normalize(input)) || childMode
    const named = resolved.member || (personal ? member : undefined)
    let events = scheduleEvents(data, family.id, named?.id, scope)
    const relativeAfter = normalize(input).includes('אחרי העבודה') ? 'work' : normalize(input).includes('אחרי בית ספר') ? 'study' : undefined
    if (named && relativeAfter) {
      const routine = routineFor(data, family.id, named.id, localDate()).find(item => item.kind === relativeAfter)
      if (routine) events = scheduleEvents(data, family.id, named.id, { kind: 'today' }).filter(event => event.time >= routine.end)
    }
    if (/לפני /.test(normalize(input))) {
      const anchor = eventReference(data, conversation, input)
      if (anchor) events = events.filter(event => event.date === anchor.date && event.time < anchor.time).slice(-1)
    }
    events = events.slice(0, 6)
    const label = scope.kind === 'tomorrow' ? 'מחר' : scope.kind === 'nextWeek' ? 'בשבוע הבא' : scope.kind === 'week' ? 'השבוע' : 'בקרוב'
    const empty = named ? `אין ל${named.name} אירועים מתוכננים ${label}.` : `אין כרגע אירועים מתוכננים ${label}.`
    const established = !!named && conversation.contextState?.lastMemberId === named.id
    return { text: events.length ? events.length === 1 ? `${correctionLead(resolved.correction)}${named ? scheduleLead(named, established) : 'יש'} ${naturalEvent(events[0])}.` : `${correctionLead(resolved.correction)}${named ? `אלה התוכניות של ${named.name}` : 'אלה התוכניות'} ${label}:\n${shortList(events.map(naturalEvent))}` : empty, type: 'entitySummary', entities: events.map(event => event.id), context: { ...context, lastMemberId: named?.id || context.lastMemberId, lastEventId: events[0]?.id, lastResultIds: events.map(event => event.id), referenceKind: events.length ? 'event' : 'member' } }
  }
  if (intent === 'NEXT_EVENT' || intent === 'PREVIOUS_EVENT') {
    const now = new Date()
    const subjectId = resolved.member?.id || context.lastMemberId
    const ordered = data.events.filter(item => item.familyId === family.id && new Date(`${item.date}T${item.endTime || item.time}:00`) >= now && (!subjectId || item.participantIds.includes(subjectId) || item.responsibleId === subjectId)).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    const anchor = ordered.findIndex(item => item.id === conversation.contextState?.lastEventId)
    const index = intent === 'PREVIOUS_EVENT' ? anchor - 1 : anchor >= 0 ? anchor + 1 : 0
    const event = ordered[index]
    const subject = family.people.find(person => person.id === subjectId)
    return event ? { text: `${intent === 'PREVIOUS_EVENT' ? 'לפני זה יש' : anchor < 0 ? 'האירוע הבא הוא' : 'אחר כך יש'} ${naturalEvent(event)}.`, entities: [event.id], context: { ...context, lastEventId: event.id, lastMemberId: subjectId, lastResultIds: [event.id], referenceKind: 'event' } } : { text: intent === 'PREVIOUS_EVENT' ? 'אין אירוע מוקדם יותר בהקשר הזה.' : subject ? `אין לי כרגע אירוע נוסף ${possessive(subject)} אחר כך.` : 'אין כרגע אירוע נוסף אחר כך.', context }
  }
  if (intent === 'EVENT_DETAILS') {
    if (/^(מתי|איפה) (זה|הוא|היא)/.test(normalize(input)) && (context.lastResultIds?.length || 0) > 1) {
      const choices = context.lastResultIds!.map(id => data.events.find(event => event.id === id)).filter((event): event is FamilyEvent => !!event).slice(0, 2)
      if (choices.length > 1) return { text: `הכוונה ל${choices[0].title} או ל${choices[1].title}?`, context }
    }
    const event = eventReference(data, conversation, input)
    if (!event) return { text: 'לא מצאתי את האירוע הזה. אפשר לכתוב את שמו או לשאול מה יש היום.', context }
    if (/איפה/.test(normalize(input))) return { text: 'אין לי מיקום שמור לאירוע הזה.', context: { ...context, lastEventId: event.id, referenceKind: 'event' } }
    if (/מתי/.test(normalize(input))) return { text: `${dateLabel(event.date)}, ${event.time}${event.endTime ? `–${event.endTime}` : ''}.`, context: { ...context, lastEventId: event.id, referenceKind: 'event' }, entities: [event.id] }
    const responsible = family.people.find(person => person.id === event.responsibleId)
    const participants = event.participantIds.map(id => family.people.find(person => person.id === id)?.name).filter(Boolean)
    const detail = [event.endTime ? `${event.time}–${event.endTime}` : event.time, participants.length ? `משתתפים: ${participants.join(', ')}` : '', responsible ? `אחריות: ${responsible.name}` : '', event.details].filter(Boolean).join(' · ')
    return { text: `${event.title} מתקיים ב־${dateLabel(event.date)}. ${detail}`, context: { ...context, lastEventId: event.id, lastMemberId: event.participantIds.length === 1 ? event.participantIds[0] : context.lastMemberId, referenceKind: 'event' }, entities: [event.id] }
  }
  if (intent === 'RESPONSIBILITY') {
    const event = (resolved.member ? data.events.filter(item => item.familyId === family.id && item.date >= localDate() && item.requiresDriver && item.participantIds.includes(resolved.member!.id)).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0] : undefined) || eventReference(data, conversation, input)
    if (!event) return { text: 'על איזו הסעה מדובר?', context }
    const request = requestForEvent(data, event.id)
    const driver = family.people.find(person => person.id === (request?.selectedDriverId || event.responsibleId))
    const returning = /מחזיר/.test(normalize(input))
    const wording = returning ? 'להחזיר' : /אוסף/.test(normalize(input)) ? 'לאסוף' : 'לקחת אחריות'
    return driver ? { text: `${driver.name} ${isFeminine(driver) ? 'אמורה' : 'אמור'} ${wording} ב${event.title}.`, context: { ...context, lastEventId: event.id, lastMemberId: driver.id, lastRideId: request?.id, referenceKind: 'ride' }, entities: [event.id, driver.id] } : { text: `עדיין לא נקבע מי ${returning ? 'מחזיר' : /אוסף/.test(normalize(input)) ? 'אוסף' : 'אחראי'} ב${event.title}.`, context: { ...context, lastEventId: event.id, lastRideId: request?.id, referenceKind: 'ride' } }
  }
  if (intent === 'OPEN_TASKS') {
    const named = resolved.member || (childMode || /(^| )(אני|לי|שלי)( |$)/.test(normalize(input)) ? member : undefined)
    const ownerId = named?.id
    const [from, to] = scopeDates(scope)
    const tasks = data.tasks.filter(task => task.familyId === family.id && !task.done && (!ownerId || task.ownerId === ownerId) && (scope.kind === 'upcoming' || task.due >= from && task.due <= to)).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5)
    const responsibilities = /צריך|צריכה/.test(normalize(input)) && ownerId ? data.events.filter(event => event.familyId === family.id && event.date >= from && event.date <= to && event.responsibleId === ownerId).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)).slice(0, 3) : []
    const heading = named ? `אלה הדברים של ${named.name}` : ownerId ? 'אלה הדברים שעוד פתוחים לך' : 'אלה המשימות שעוד פתוחות'
    const lines = [...tasks.map(task => `${task.title} · עד ${dateLabel(task.due)}`), ...responsibilities.map(event => `${event.title} · אחריות ב־${event.time}`)]
    const established = !!named && conversation.contextState?.lastMemberId === named.id
    return { text: lines.length ? lines.length === 1 ? `${named ? established ? `נשאר ${pronoun(named)}` : `ל${named.name} נשאר` : 'נשאר'} ${lines[0]}.` : `${heading}:\n${shortList(lines)}` : named ? `אין ל${named.name} משימות או אחריות פתוחה בטווח הזה.` : 'אין משימות פתוחות כרגע.', type: 'entitySummary', entities: [...tasks.map(task => task.id), ...responsibilities.map(event => event.id)], context: { ...context, lastMemberId: named?.id || context.lastMemberId, lastTaskId: tasks[0]?.id, lastEventId: responsibilities[0]?.id || context.lastEventId, lastResultIds: [...tasks.map(task => task.id), ...responsibilities.map(event => event.id)], referenceKind: tasks.length ? 'task' : responsibilities.length ? 'event' : 'task' } }
  }
  if (intent === 'WHAT_NEEDS_ATTENTION') {
    if (childMode) return { text: 'במצב ילד אני יכולה לעזור עם הלו״ז שלך, החוגים ומי אוסף אותך.', context }
    const interventions = visibleInterventions(data, family.id, member, false).filter(item => ['decisionRequired', 'waiting', 'owned', 'inProgress'].includes(item.status))
    const tasks = data.tasks.filter(task => task.familyId === family.id && !task.done && (task.priority === 'high' || task.priority === 'critical')).slice(0, 2)
    const rides = data.transportationRequests.filter(request => request.familyId === family.id && !['COVERED', 'CANCELLED'].includes(request.status)).slice(0, 2)
    const items = [...interventions.slice(0, 2).map(item => item.detectedChange), ...rides.map(request => `עדיין אין נהג מאושר ל־${data.events.find(event => event.id === request.eventId)?.title || 'הסעה'}`), ...tasks.map(task => `${task.title} עד ${dateLabel(task.due)}`)].slice(0, 4)
    const intervention = interventions[0]
    const primary = intervention?.actions.find(action => action.primary) || intervention?.actions.find(action => ['approve', 'addToCalendar', 'createTask'].includes(action.kind))
    const decision = primary?.kind as 'approve' | 'addToCalendar' | 'createTask' | undefined
    const pendingIntent: LiaPendingIntent | undefined = intervention && decision ? { type: 'liaInterventionAction', interventionId: intervention.id, proposedAction: decision } : undefined
    return { text: items.length ? `יש כרגע ${items.length === 1 ? 'דבר אחד' : `${items.length} דברים`} שדורשים תשומת לב:\n${shortList(items)}` : 'הכול בשליטה כרגע. אין משהו שדורש ממך פעולה.', type: pendingIntent ? 'actionRequest' : 'entitySummary', action: pendingIntent ? { kind: 'liaDecision', label: primary?.label || 'אישור', interventionId: intervention.id, decision } : undefined, context: { ...context, pendingIntent, lastInterventionId: intervention?.id, lastTaskId: tasks[0]?.id, lastRideId: rides[0]?.id, referenceKind: intervention ? 'intervention' : rides[0] ? 'ride' : tasks[0] ? 'task' : context.referenceKind } }
  }
  if (intent === 'MORE') {
    const event = data.events.find(item => item.id === context.lastEventId)
    if (/מי עוד/.test(normalize(input)) && event) {
      const excluded = new Set([...(context.excludedMemberIds || []), context.lastMemberId || ''])
      const options = driverOptions(data, event).filter(option => !excluded.has(option.person.id))
      if (!options.length) return { text: 'אין כרגע אפשרות נוספת שמתאימה.', context }
      const next = options[0]
      return { text: `${next.person.name} ${isFeminine(next.person) ? 'יכולה להתאים' : 'יכול להתאים'} גם. ${isFeminine(next.person) ? 'היא פנויה' : 'הוא פנוי'} ואין התנגשות בשעה הזו.`, context: { ...context, lastMemberId: next.person.id, candidateMemberIds: options.map(option => option.person.id), excludedMemberIds: [...excluded], referenceKind: 'ride' }, entities: [event.id, next.person.id] }
    }
    const ids = new Set(context.lastResultIds || [])
    if (context.referenceKind === 'event') {
      const more = scheduleEvents(data, family.id, context.lastMemberId, context.temporalScope || { kind: 'upcoming' }).filter(event => !ids.has(event.id)).slice(0, 4)
      return more.length ? { text: `יש גם:\n${shortList(more.map(naturalEvent))}`, entities: more.map(item => item.id), context: { ...context, lastEventId: more[0].id, lastResultIds: [...ids, ...more.map(item => item.id)] } } : { text: 'לא מצאתי משהו נוסף בטווח הזה.', context }
    }
    if (context.referenceKind === 'task') {
      const more = data.tasks.filter(task => task.familyId === family.id && !task.done && (!context.lastMemberId || task.ownerId === context.lastMemberId) && !ids.has(task.id)).slice(0, 4)
      return more.length ? { text: `יש גם:\n${shortList(more.map(task => `${task.title} · עד ${dateLabel(task.due)}`))}`, entities: more.map(item => item.id), context: { ...context, lastTaskId: more[0].id, lastResultIds: [...ids, ...more.map(item => item.id)] } } : { text: 'אין משימה פתוחה נוספת כרגע.', context }
    }
    return { text: 'על מה תרצה להרחיב—הלו״ז, המשימות או ההסעה?', context }
  }
  if (intent === 'WHAT_IF') {
    const event = eventReference(data, conversation, input)
    const candidate = resolved.member
    if (event && candidate && /(יכול|יכולה|נעביר|במקום|פנוי|פנויה)/.test(normalize(input))) {
      const reason = memberRideReason(data, event, candidate)
      return { text: reason ? `לא כרגע — ${naturalConstraint(candidate, reason)}.` : `כן, זה מסתדר. ${candidate.name} ${isFeminine(candidate) ? 'פנויה' : 'פנוי'} ואין ${pronoun(candidate)} התנגשות בשעה הזו. זו רק בדיקה; לא שיניתי דבר.`, context: { ...context, lastEventId: event.id, lastMemberId: candidate.id, referenceKind: 'ride' }, entities: [event.id, candidate.id] }
    }
    const time = input.match(/(?:ל|בשעה)\s*(\d{1,2}:\d{2})/)?.[1]
    if (event && time) {
      const simulated = { ...event, time }
      const conflicts = family.people.filter(person => event.participantIds.includes(person.id) || person.id === event.responsibleId).flatMap(person => { const reason = pickupIneligibility(person, simulated, data); return reason ? [naturalConstraint(person, reason)] : [] })
      return { text: conflicts.length ? `אם מזיזים ל־${time}, יש בעיה: ${conflicts.join('; ')}. לא שיניתי את האירוע.` : `לפי הלו״ז הקיים, מעבר ל־${time} לא יוצר התנגשות לאנשים המעורבים. לא שיניתי את האירוע.`, context: { ...context, lastEventId: event.id, referenceKind: 'event' } }
    }
    return { text: 'כדי לבדוק תרחיש בלי לשנות דבר, צריך לציין אירוע ומי אמור/ה לקחת אחריות או שעה חלופית.', context }
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
      const covered = data.events.filter(item => item.familyId === family.id && item.date >= localDate() && item.requiresDriver && (item.responsibleId || requestForEvent(data, item.id)?.selectedDriverId) && (!named || item.participantIds.includes(named.id))).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0]
      const driver = family.people.find(person => person.id === (covered?.responsibleId || (covered && requestForEvent(data, covered.id)?.selectedDriverId)))
      return driver && covered ? { text: `${driver.name} כבר אחראי/ת להסעה ל־${covered.title}. האיסוף מכוסה.`, context: { ...context, lastEventId: covered.id, lastMemberId: driver.id }, entities: [covered.id, driver.id] } : { text: 'לא מצאתי אירוע קרוב שדורש הסעה. אפשר לציין שם של אירוע או בן משפחה.', context }
    }
    if (resolved.explicit && resolved.member && context.lastEventId === event.id) {
      const candidate = resolved.member
      const reason = memberRideReason(data, event, candidate)
      if (reason) return { text: `${candidate.name} לא יכול/ה לקחת כרגע: ${reason}.`, context: { ...context, lastMemberId: candidate.id, lastEventId: event.id, pendingIntent: undefined, referenceKind: 'ride' } }
      const pendingIntent: LiaPendingIntent = { type: 'sendRideRequest', relatedEventId: event.id, suggestedMemberId: candidate.id, proposedAction: 'sendRideRequest' }
      const feminine = candidate.role === 'אם' || candidate.role === 'בת'
      return { text: `${candidate.name} ${feminine ? 'פנויה ומתאימה' : 'פנוי ומתאים'} לפי הלו״ז ותנאי הנהיגה. רוצה שאשלח בקשה?`, type: 'actionRequest', action: { kind: 'sendRideRequest', label: 'שליחת בקשה', eventId: event.id, memberId: candidate.id }, context: { ...context, pendingIntent, lastMemberId: candidate.id, lastEventId: event.id, candidateMemberIds: [candidate.id], referenceKind: 'ride' }, entities: [event.id, candidate.id] }
    }
    const alternativesOnly = /אז מי כן|מי עוד|במקום/.test(normalize(input))
    const options = driverOptions(data, event).filter(option => !alternativesOnly || option.person.id !== context.lastMemberId)
    if (!options.length) {
      const reasons = family.people.filter(person => person.age >= 18).map(person => ({ person, reason: memberRideReason(data, event, person) })).filter(item => item.reason).slice(0, 2)
      return { text: `לא מצאתי כרגע נהג/ת כשיר/ה ופנוי/ה ל־${event.title}.${reasons.length ? ` ${reasons.map(item => `${item.person.name} ${item.reason}`).join(', ')}.` : ''}`, context: { ...context, lastEventId: event.id, referenceKind: 'ride' } }
    }
    const best = options[0]
    const alternative = options[1]
    const pendingIntent: LiaPendingIntent = { type: 'sendRideRequest', relatedEventId: event.id, suggestedMemberId: best.person.id, proposedAction: 'sendRideRequest' }
    return { text: `${best.person.name} ${best.person.role === 'אם' || best.person.role === 'בת' ? 'פנויה ומתאימה' : 'פנוי ומתאים'} כרגע.${alternative ? ` גם ${alternative.person.name} אפשרות טובה.` : ''}\nרוצה שאשלח ${best.person.role === 'אם' || best.person.role === 'בת' ? 'לה' : 'לו'} בקשה?`, type: 'actionRequest', action: { kind: 'sendRideRequest', label: 'שליחת בקשה', eventId: event.id, memberId: best.person.id }, entities: [event.id, best.person.id], context: { ...context, pendingIntent, lastEventId: event.id, lastMemberId: best.person.id, candidateMemberIds: options.map(option => option.person.id), excludedMemberIds: [], lastRideId: requestForEvent(data, event.id)?.id, referenceKind: 'ride' } }
  }
  if (intent === 'ACTION_REQUEST') {
    if (childMode) return { text: 'פעולת העברה דורשת אישור של בן משפחה בוגר.', context }
    const intervention = visibleInterventions(data, family.id, member, false).find(item => item.id === context.lastInterventionId)
    const requestedDecision = /תדחי|דחי/.test(normalize(input)) ? 'dismiss' : /תאשרי|אשרי/.test(normalize(input)) ? (intervention?.actions.find(action => action.primary)?.kind || (intervention?.type === 'traffic' ? 'approve' : undefined)) : /תעבירי|תשייכי/.test(normalize(input)) && intervention ? 'reassign' : undefined
    if (intervention && requestedDecision && ['approve', 'addToCalendar', 'createTask', 'dismiss', 'reassign'].includes(requestedDecision)) {
      const target = requestedDecision === 'reassign' ? resolved.member : undefined
      if (requestedDecision === 'reassign' && !target) return { text: 'למי להעביר את האחריות? אפשר לכתוב את השם.', context }
      const pendingIntent: LiaPendingIntent = { type: 'liaInterventionAction', interventionId: intervention.id, proposedAction: requestedDecision as 'approve' | 'addToCalendar' | 'createTask' | 'dismiss' | 'reassign', targetMemberId: target?.id }
      const copy = requestedDecision === 'dismiss' ? `לדחות את ההמלצה “${intervention.recommendation}”?` : requestedDecision === 'reassign' ? `להעביר את האחריות ל${target!.name}?` : `לאשר את ההמלצה “${intervention.recommendation}”?`
      return { text: copy, type: 'actionRequest', action: { kind: 'liaDecision', label: requestedDecision === 'dismiss' ? 'דחייה' : requestedDecision === 'reassign' ? 'העברה' : 'אישור', interventionId: intervention.id, decision: pendingIntent.proposedAction, memberId: target?.id }, context: { ...context, pendingIntent, lastMemberId: target?.id || context.lastMemberId, referenceKind: 'intervention' }, entities: [intervention.id, ...(target ? [target.id] : [])] }
    }
    const event = eventReference(data, conversation, input)
    const target = resolved.member
    if (!event || !target) return { text: !event ? 'לא ברור לי איזו הסעה להעביר. אפשר לציין את שם האירוע.' : 'למי להעביר? אפשר לכתוב את שם בן או בת המשפחה.', context }
    const reason = memberRideReason(data, event, target)
    if (reason) return { text: `לא כדאי להעביר ל${target.name} — ${naturalConstraint(target, reason)}. לא שיניתי דבר.`, context: { ...context, lastEventId: event.id, lastMemberId: target.id, referenceKind: 'ride' } }
    const pendingIntent: LiaPendingIntent = { type: 'sendRideRequest', relatedEventId: event.id, suggestedMemberId: target.id, proposedAction: 'sendRideRequest' }
    return { text: `אפשר לשלוח ל${target.name} בקשה לקחת אחריות על ${event.title}. לשלוח?`, type: 'actionRequest', action: { kind: 'sendRideRequest', label: 'שליחת בקשה', eventId: event.id, memberId: target.id }, entities: [event.id, target.id], context: { ...context, pendingIntent, lastEventId: event.id, lastMemberId: target.id, candidateMemberIds: [target.id], referenceKind: 'ride' } }
  }
  if (intent === 'MEMBER_AVAILABILITY') {
    const named = resolved.member
    if (!named) {
      if (/אחותו|אחיו|אחותה|אח שלה/.test(normalize(input))) return { text: 'לא בטוחה לאיזה בן או בת משפחה התכוונת. אפשר לכתוב את השם כדי שאבדוק בלי לנחש.', context }
      const times = [...input.matchAll(/(\d{1,2}:\d{2})/g)].map(match => match[1])
      const from = times[0] || (/בערב/.test(normalize(input)) ? '18:00' : undefined)
      const to = times[1] || (from ? '22:00' : undefined)
      const available = from && to ? availableMembersBetween(data, family.id, localDate(), from, to) : family.people.filter(person => person.age >= 18 && person.availableForPickup && person.availability !== 'unavailable')
      return { text: available.length ? `${from && to ? `בין ${from} ל־${to} פנויים לפי הלו״ז` : 'האנשים שמסומנים כפנויים כרגע'}: ${available.map(person => person.name).join(', ')}.` : from && to ? `לא מצאתי מבוגר פנוי בין ${from} ל־${to} לפי הלו״ז הקיים.` : 'לא מצאתי כרגע מבוגר שמסומן כפנוי.', context }
    }
    const event = eventReference(data, conversation, input) || matchingEvent(data, family.id, input, conversation)
    const reason = event ? memberRideReason(data, event, named) : named.availableForPickup && named.availability !== 'unavailable' ? null : named.availability === 'work' ? 'בעבודה' : 'לא מסומן/ת כזמין/ה'
    const available = !reason
    const feminine = named.role === 'אם' || named.role === 'בת'
    if (available && event && !childMode) {
      const pendingIntent: LiaPendingIntent = { type: 'sendRideRequest', relatedEventId: event.id, suggestedMemberId: named.id, proposedAction: 'sendRideRequest' }
      return { text: `${named.name} ${feminine ? 'פנויה' : 'פנוי'} בזמן הזה, ולא מצאתי התנגשות שמונעת את ההסעה. אפשר לשלוח ${feminine ? 'לה' : 'לו'} בקשה.`, type: 'actionRequest', action: { kind: 'sendRideRequest', label: 'שליחת בקשה', eventId: event.id, memberId: named.id }, entities: [event.id, named.id], context: { ...context, pendingIntent, lastMemberId: named.id, lastEventId: event.id } }
    }
    return { text: available ? `${named.name} ${feminine ? 'פנויה' : 'פנוי'} בשעה הזו.` : `${naturalConstraint(named, reason!)}.`, context: { ...context, pendingIntent: undefined, lastMemberId: named.id, lastEventId: event?.id || context.lastEventId, referenceKind: event ? 'ride' : 'member' } }
  }
  if (intent === 'RECENT_CHANGES') {
    const visibleSources = new Set(member.personalSettings?.integrations.filter(item => item.connectionStatus === 'connected' && item.liaAccess === 'allowed').map(item => item.sourceId) || [])
    const todayOnly = /היום/.test(normalize(input))
    const activity = data.activity.filter(item => item.familyId === family.id && (!todayOnly || !item.createdAt || item.createdAt.slice(0, 10) === localDate()) && (!childMode || item.personIds.includes(member.id)) && (!item.source || item.source === 'family' || visibleSources.has(item.source))).slice(0, 4)
    return { text: activity.length ? `אלה העדכונים האחרונים:\n${shortList(activity.map(item => item.text))}` : 'אין כרגע עדכון חדש שרלוונטי לך.', type: 'entitySummary', context: { ...context, lastActivityId: activity[0]?.id, lastSourceId: activity[0]?.source } }
  }
  if (intent === 'SOURCE_DETAILS') {
    return context.lastSourceId ? { text: `העדכון האחרון הגיע מ־${sourceLabels[context.lastSourceId] || context.lastSourceId}. אני מציגה רק את העדכון המשפחתי שנשמר, לא תוכן פרטי גולמי.`, context } : { text: 'אין לי כרגע עדכון קודם עם מקור שאפשר לזהות. אפשר לשאול “מה השתנה היום?”.', context }
  }
  if (intent === 'COMBINED_SUMMARY') {
    const events = data.events.filter(item => item.familyId === family.id && item.date >= localDate()).length
    const tasks = data.tasks.filter(item => item.familyId === family.id && !item.done).length
    const rides = data.transportationRequests.filter(item => item.familyId === family.id && !['COVERED', 'CANCELLED'].includes(item.status)).length
    const decisions = visibleInterventions(data, family.id, member, childMode).filter(item => ['decisionRequired', 'waiting', 'owned', 'inProgress'].includes(item.status)).length
    return { text: `הנה תמונת מצב אחת:\n• ${events} אירועים קרובים\n• ${rides} הסעות פתוחות\n• ${tasks} משימות פתוחות\n• ${decisions} החלטות שמחכות לטיפול`, type: 'entitySummary', context }
  }
  if (intent === 'ALREADY_HANDLED') {
    if (childMode) return { text: 'אני יכולה לעדכן אותך לגבי האירועים והאיסופים שלך.', context }
    const handled = visibleInterventions(data, family.id, member, false).filter(item => ['completed', 'noAction'].includes(item.status)).slice(0, 4)
    return { text: handled.length ? `אלה האירועים שכבר טופלו:\n${shortList(handled.map(item => item.resolutionSummary || item.title))}` : 'לא מצאתי כרגע פעולות שסומנו כטופלו.', type: 'entitySummary', context }
  }
  if (intent === 'RIDE_STATUS') {
    const event = data.events.find(item => item.id === context.lastEventId) || matchingEvent(data, family.id, input, conversation)
    const request = event && requestForEvent(data, event.id)
    const driver = family.people.find(person => person.id === (request?.selectedDriverId || event?.responsibleId))
    if (driver && event) return { text: `ההסעה ל${event.title} מכוסה — ${driver.name} ${isFeminine(driver) ? 'אחראית' : 'אחראי'}.`, context: { ...context, pendingIntent: undefined, lastEventId: event.id } }
    if (request && context.lastMemberId && request.responses[context.lastMemberId] === 'PENDING') return { text: `הבקשה ל${family.people.find(person => person.id === context.lastMemberId)?.name || 'בן המשפחה'} עדיין ממתינה לתגובה.`, context }
    return { text: request ? 'בקשת ההסעה עדיין פתוחה וממתינה לתשובות.' : 'לא מצאתי בקשת הסעה פתוחה בהקשר הנוכחי.', context }
  }
  if (intent === 'EXPLAIN') {
    const intervention = visibleInterventions(data, family.id, member, childMode).find(item => item.id === context.lastInterventionId)
    if (intervention) return { text: intervention.explanation, context }
    const activity = data.activity.find(item => item.id === context.lastActivityId)
    if (activity && conversation.contextState?.lastIntent === 'RECENT_CHANGES') return { text: `זה השינוי האחרון שנרשם בתוכנית: ${activity.text}. המקור הוא ${sourceLabels[activity.source || 'family'] || activity.source}.`, context }
    const event = data.events.find(item => item.id === context.lastEventId)
    const person = resolved.member || family.people.find(item => item.id === context.lastMemberId)
    if (event && person) {
      const reason = memberRideReason(data, event, person)
      if (reason) return { text: `${naturalConstraint(person, reason)}.`, context: { ...context, lastMemberId: person.id, referenceKind: 'ride' } }
      return { text: `${person.name} ${isFeminine(person) ? 'פנויה ויכולה' : 'פנוי ויכול'} לנהוג, ואין ${pronoun(person)} התנגשות בשעה הזו.`, context: { ...context, lastMemberId: person.id, referenceKind: 'ride' } }
    }
    return { text: 'אין לי כרגע המלצה קודמת שאפשר להסביר. אפשר לשאול מי פנוי להסעה.', context }
  }
  if (intent === 'HELP') return { text: childMode ? 'אני יכולה לעזור עם הלו״ז שלך, החוגים ומי אוסף אותך.' : 'אני יכולה לעזור עם הלו״ז, אירועים קרובים, משימות, הסעות, זמינות, שינויים ומה שדורש טיפול במשפחה.', context }
  const unsupportedLive = /מזג.*אוויר|וואטסאפ|whatsapp/.test(normalize(input))
  if (unsupportedLive) return { text: 'אין לי גישה למידע חי או לתוכן פרטי שלא התקבל כמקור מחובר ומאושר. אני לא אנחש; אפשר לבדוק עדכונים שכבר נשמרו בתוכנית.', context }
  if (/אחותו|אחיו|אחותה|אח שלה|אח שלו/.test(normalize(input))) return { text: 'לא בטוחה לאיזה בן או בת משפחה התכוונת. אפשר לכתוב את השם כדי שאבדוק בלי לנחש.', context }
  if (/תעשי (את )?זה|תטפלי בזה/.test(normalize(input))) return { text: 'לא ברור לי איזו פעולה לבצע. אפשר לציין אם לשלוח בקשת הסעה, לפתוח את הלו״ז או לבדוק משימה.', context }
  const named = family.people.find(person => normalize(input).includes(normalize(person.name)))
  return { text: named ? `מה תרצה לבדוק לגבי ${named.name} — לו״ז, משימות או הסעות?` : 'לא הבנתי עד הסוף. לבדוק את הלו״ז, המשימות או ההסעות?', context: { ...context, lastMemberId: named?.id || context.lastMemberId } }
}

export function performLiaChatAction(data: AppData, conversation: LiaConversation, memberId: string, pending = conversation.contextState?.pendingIntent): { data: AppData; conversation: LiaConversation; success: boolean } {
  if (!pending) return { data, conversation, success: false }
  if (pending.type === 'liaInterventionAction') {
    const action = pending.proposedAction as LiaActionKind
    let nextData = applyShowcaseAction(data, pending.interventionId, action, memberId, pending.targetMemberId)
    if (nextData === data) nextData = applyTrafficFlowAction(data, pending.interventionId, action, memberId, pending.targetMemberId)
    const success = nextData !== data
    const intervention = (nextData.liaInterventions || []).find(item => item.id === pending.interventionId)
    const text = success ? action === 'dismiss' ? 'ביטלתי את ההמלצה. לא בוצע שינוי.' : intervention?.resolutionSummary ? `${action === 'reassign' ? 'סגור, ' : 'אישרתי. '}${intervention.resolutionSummary}` : 'אישרתי ועדכנתי את המידע הרלוונטי.' : 'לא הצלחתי לבצע את הפעולה. ייתכן שהיא כבר טופלה או שאינה מורשית.'
    const result = message('lia', text, 'actionResult', undefined, [pending.interventionId])
    const next = { ...conversation, messages: [...conversation.messages.map(item => item.action?.kind === 'liaDecision' ? { ...item, status: (success ? 'completed' : 'failed') as 'completed' | 'failed' } : item), result], updatedAt: result.createdAt, contextState: { ...conversation.contextState, pendingIntent: undefined, lastInterventionId: pending.interventionId } }
    return { data: saveConversation(nextData, next), conversation: next, success }
  }
  const event = data.events.find(item => item.id === pending.relatedEventId)
  const family = data.families.find(item => item.id === conversation.familyId)
  const target = family?.people.find(item => item.id === pending.suggestedMemberId)
  if (!event || !target || !eligibleDrivers(data, event).some(person => person.id === target.id)) {
    const result = message('lia', 'לא הצלחתי לשלוח את הבקשה כי האירוע כבר לא קיים או שהנהג כבר לא פנוי.', 'actionResult')
    const next = { ...conversation, messages: [...conversation.messages.map(item => item.action?.kind === 'sendRideRequest' ? { ...item, status: 'failed' as const } : item), result], updatedAt: result.createdAt, contextState: { ...conversation.contextState, pendingIntent: undefined } }
    return { data: saveConversation(data, next), conversation: next, success: false }
  }
  let nextData = ensureRequests(data, memberId)
  let request = requestForEvent(nextData, event.id)
  if (!request && event.requiresDriver && !event.responsibleId) {
    request = createRequest(nextData, event, memberId)
    nextData = { ...nextData, transportationRequests: [...nextData.transportationRequests, request] }
  }
  if (!request) {
    const result = message('lia', 'לא הצלחתי לפתוח בקשת הסעה עבור האירוע הזה.', 'actionResult')
    const next = { ...conversation, messages: [...conversation.messages, result], updatedAt: result.createdAt, contextState: { ...conversation.contextState, pendingIntent: undefined } }
    return { data: saveConversation(data, next), conversation: next, success: false }
  }
  const result = message('lia', `סגור, שלחתי ל${target.name}. הבקשה ממתינה לתגובה.`, 'actionResult', undefined, [request.id, event.id, target.id])
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
    conversation = { ...conversation, messages: conversation.messages.map(item => item.action && item.status === 'sent' ? { ...item, status: 'dismissed' as const } : item) }
  }
  const generated = responseFor(data, conversation, member, text, member.age < 18)
  const liaMessage = message('lia', generated.text, generated.type || 'text', generated.action, generated.entities)
  conversation = { ...conversation, messages: [...conversation.messages, liaMessage], updatedAt: liaMessage.createdAt, contextState: generated.context }
  return { data: saveConversation(data, conversation), conversation }
}

export function clearLiaConversation(data: AppData, familyId: string, memberId: string): AppData {
  return { ...data, liaConversations: (data.liaConversations || []).filter(item => item.familyId !== familyId || item.memberId !== memberId) }
}
