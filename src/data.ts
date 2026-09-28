export type Priority = 'low' | 'normal' | 'high' | 'critical'
export type RoutineKind = 'work' | 'study' | 'activity'
export type WeeklyRoutine = { id: string; kind: RoutineKind; label: string; day?: number; days?: number[]; start: string; end: string; location?: string; prepTitle?: string; prepOwnerId?: string }
export type EventAcknowledgement = { eventId: string; personId: string; signature: string; status: 'pending' | 'seen' | 'approved' | 'declined'; updatedAt?: string }
export type PendingAction = { id: string; familyId: string; source: 'external' | 'scenario'; scenarioId: string; message: string; createdAt: string }
export type FamilyPreferences = { preferFewerTrips?: boolean; balanceRides?: boolean; preferNearbyDriver?: boolean; moveFlexibleTasks?: boolean; allowPublicTransit?: boolean; autonomy?: 'conservative' | 'balanced' | 'autopilot' }
export type PersonalIntegration = { sourceId: IntegrationSource; connectionStatus: 'connected' | 'disconnected'; liaAccess: 'allowed' | 'notAllowed'; mode: 'demo' | 'live' }
export type PersonalSettings = { notifications: { enabled: boolean }; lia: { proactiveSuggestions: boolean }; integrations: PersonalIntegration[] }
export type Person = { id: string; name: string; role: 'אב' | 'אם' | 'בן' | 'בת'; color: string; age: number; birthYear?: number; birthDate?: string; hasLicense: boolean; hasCar: boolean; availableForPickup: boolean; availability?: 'available' | 'home' | 'work' | 'travel' | 'unavailable'; unavailableUntil?: string; travelMinutes?: number; activeDriver?: boolean; unavailableFrom?: string; unavailableTo?: string; preferredMaxRides?: number; lastResortDriver?: boolean; canUseTransit?: boolean; canTravelAlone?: boolean; routines?: WeeklyRoutine[]; personalSettings?: PersonalSettings }
export type FamilyUnit = { id: string; name: string; people: Person[]; preferences?: FamilyPreferences }
export type FamilyEvent = { id: string; familyId: string; title: string; date: string; time: string; endDate?: string; endTime?: string; icon: string; participantIds: string[]; responsibleId: string; details: string; needsAttention?: boolean; requiresDriver?: boolean; departureTime?: string; routeMinutes?: number; createdById?: string; issueReason?: string; sourceNote?: string; sourceSignalId?: string; priority?: Priority; preferredDriverId?: string; transitAvailable?: boolean; routineOverride?: boolean }
export type FamilyTask = { id: string; familyId: string; title: string; ownerId: string; due: string; done: boolean; eventId?: string; sourceSignalId?: string; requiresAdult?: boolean; priority?: Priority; flexible?: boolean; repeatDays?: number[]; responsibility?: boolean; routineId?: string }
export type Activity = { id: string; familyId: string; text: string; personIds: string[]; createdAt?: string; source?: IntegrationSource; eventId?: string }
export type TransportationRequest = { id: string; familyId: string; eventId: string; passengerId: string; eligibleMemberIds: string[]; responses: Record<string, 'PENDING' | 'CAN_DO' | 'CANNOT_DO'>; selectedDriverId: string; status: 'OPEN' | 'PARTIALLY_RESPONDED' | 'COVERED' | 'UNRESOLVED' | 'CANCELLED'; createdById: string; origin: string; destination: string; requiredAt: string }
export type IntegrationSource = 'waze' | 'whatsapp' | 'school' | 'university' | 'family' | 'calendar' | 'email' | 'weather' | 'location' | 'work' | 'club' | 'transit'
export type IntegrationLog = { id: string; familyId: string; scenarioKey: string; source: IntegrationSource; sourceText: string; action: string; personIds: string[]; eventId?: string; createdAt: string; trigger?: 'manual' | 'automatic'; handledAt?: string; privacy?: { ownerId?: string; rawVisibility: 'private'; familyInsight: string } }
export type CalendarMirror = { id: string; familyId: string; eventId: string; personId: string; provider: 'google'; createdAt: string }
import type { LiaIntervention } from './liaInterventions'
import type { LiaConversation } from './liaChatTypes'
import type { TrafficSignal } from './trafficSignals'
import type { ExternalSignal } from './showcaseFlows'
export type AppData = { families: FamilyUnit[]; events: FamilyEvent[]; tasks: FamilyTask[]; activity: Activity[]; transportationRequests: TransportationRequest[]; integrationLogs: IntegrationLog[]; calendarMirrors: CalendarMirror[]; acknowledgements?: EventAcknowledgement[]; suppressedRoutineTaskIds?: string[]; pendingActions?: PendingAction[]; dismissedActionIds?: string[]; trafficSignals?: TrafficSignal[]; externalSignals?: ExternalSignal[]; liaInterventions?: LiaIntervention[]; liaConversations?: LiaConversation[]; demoResetAt?: string }

export const uid = () => Math.random().toString(36).slice(2, 10)
export const ageFromBirthYear = (year: number) => new Date().getFullYear() - year
export const DEFAULT_FAMILY_ID = 'Avrahami'
export const personalSourceIds: IntegrationSource[] = ['calendar', 'whatsapp', 'email', 'waze', 'location', 'school', 'university', 'work', 'club', 'transit']
export function defaultPersonalSettings(): PersonalSettings {
  return { notifications: { enabled: true }, lia: { proactiveSuggestions: true }, integrations: personalSourceIds.map(sourceId => ({ sourceId, connectionStatus: 'disconnected', liaAccess: 'notAllowed', mode: 'demo' })) }
}
export function normalizePersonalSettings(settings?: Partial<PersonalSettings>): PersonalSettings {
  const existing = new Map((settings?.integrations || []).map(item => [item.sourceId, item]))
  return {
    notifications: { enabled: settings?.notifications?.enabled ?? true },
    lia: { proactiveSuggestions: settings?.lia?.proactiveSuggestions ?? true },
    integrations: personalSourceIds.map(sourceId => {
      const item = existing.get(sourceId)
      return { sourceId, connectionStatus: item?.connectionStatus === 'connected' ? 'connected' : 'disconnected', liaAccess: item?.liaAccess === 'allowed' ? 'allowed' : 'notAllowed', mode: item?.mode === 'live' ? 'live' : 'demo' }
    }),
  }
}
function demoPersonalSettings(): PersonalSettings {
  const settings = defaultPersonalSettings()
  return { ...settings, integrations: settings.integrations.map(item => ['waze', 'calendar', 'whatsapp', 'email', 'school'].includes(item.sourceId) ? { ...item, connectionStatus: 'connected', liaAccess: 'allowed' } : item) }
}
export function validBirthDate(value: string, today = localDate()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > today) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}
export function ageFromBirthDate(value: string, today = localDate()): number {
  if (!validBirthDate(value, today)) return NaN
  const [year, month, day] = value.split('-').map(Number)
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number)
  const birthdayDay = month === 2 && day === 29 && !(currentYear % 4 === 0 && (currentYear % 100 !== 0 || currentYear % 400 === 0)) ? 28 : day
  return currentYear - year - (currentMonth < month || currentMonth === month && currentDay < birthdayDay ? 1 : 0)
}
export const localDate = (offset = 0) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const nextFriday = () => {
  const date = new Date()
  const currentDay = date.getDay()
  const diff = (5 - currentDay + 7) % 7 || 7
  date.setDate(date.getDate() + diff)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function mergeRoutineEntries(routines: WeeklyRoutine[] = []): WeeklyRoutine[] {
  const grouped = new Map<string, WeeklyRoutine>()
  for (const routine of routines) {
    const explicitDays = Array.isArray(routine.days)
      ? routine.days.filter((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day < 7)
      : []
    const fallbackDay = typeof routine.day === 'number' && Number.isInteger(routine.day) && routine.day >= 0 && routine.day < 7 ? [routine.day] : []
    const days = [...new Set([...explicitDays, ...fallbackDay])].sort((a, b) => a - b)
    const key = `${routine.kind}|${routine.start}|${routine.end}`
    const current = grouped.get(key)
    const mergedDays = [...new Set([...(current?.days || []), ...days])].sort((a, b) => a - b)
    grouped.set(key, {
      ...routine,
      id: current?.id || routine.id,
      label: current?.label || routine.label || 'לו״ז קבוע',
      prepTitle: current?.prepTitle || routine.prepTitle,
      day: current?.day ?? routine.day,
      days: mergedDays,
    })
  }
  return [...grouped.values()]
}
export const dateLabel = (value: string) => {
  if (value === localDate()) return 'היום'
  if (value === localDate(1)) return 'מחר'
  return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`))
}
export const cleanStoredText = (value: string | null | undefined) => (value || '').normalize('NFC')
  .replace(/\u00e2\u20ac[\u0098\u0099\u02dc\u2122]/g, "'")
  .replace(/\u00e2\u20ac[\u009c\u009d\u0152\u0153]/g, '"')
  .replace(/\u00e2\u20ac[\u0093\u0094\u201c\u201d]/g, '-')
  .replace(/\u00e2\u20ac\u00a6/g, '...')
  .replace(/\u00c2\u00a0/g, ' ')
  .replace(/\u00c2(?=\s|$)/g, '')
  .replace(/[\u2018\u2019\u201a\u201b\u02bc\u05f3]/g, "'")
  .replace(/[\u201c\u201d\u201e\u201f\u05f4]/g, '"')
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/\u2026/g, '...')
  .replace(/[\u00a0\u200b\ufeff]/g, ' ')
  .replace(/\uFFFD/g, '').trim()

const weeklyCare = (personId: string, label: string): WeeklyRoutine[] => [
  { id: `default-${personId}-weekdays`, kind: 'study', label, day: 0, days: [0, 1, 2, 3, 4], start: '08:00', end: '16:00' },
  { id: `default-${personId}-friday`, kind: 'study', label, day: 5, days: [5], start: '08:00', end: '13:30' },
]

const defaultFamilyRoutines: Record<string, WeeklyRoutine[]> = {
  Itamar: [{ id: 'default-Itamar-soccer', kind: 'activity', label: 'חוג כדורגל', day: 2, days: [2], start: '18:00', end: '20:00' }],
  noa: [{ id: 'default-noa-swim', kind: 'activity', label: 'חוג שחייה', day: 3, days: [3], start: '18:00', end: '19:30' }],
  Mor: [{ id: 'default-Mor-work', kind: 'work', label: 'עבודה', day: 0, days: [0, 1, 2, 3, 4], start: '09:00', end: '15:30' }],
  Orel: [{ id: 'default-Orel-work', kind: 'work', label: 'עבודה', day: 0, days: [0, 1, 2, 3, 4], start: '07:00', end: '16:00' }],
}

export const initialData: AppData = {
  families: [{ id: DEFAULT_FAMILY_ID, name: 'משפחת אברהמי', people: [
    { id: 'Orel', name: 'אוראל', role: 'אב', color: 'sage', birthDate: '1988-11-06', birthYear: 1988, age: ageFromBirthDate('1988-11-06'), hasLicense: true, hasCar: true, availableForPickup: true, routines: defaultFamilyRoutines.Orel, personalSettings: demoPersonalSettings() },
    { id: 'Mor', name: 'מור', role: 'אם', color: 'peach', birthDate: '1993-12-12', birthYear: 1993, age: ageFromBirthDate('1993-12-12'), hasLicense: true, hasCar: true, availableForPickup: true, routines: defaultFamilyRoutines.Mor, personalSettings: demoPersonalSettings() },
    { id: 'Itamar', name: 'איתמר', role: 'בן', color: 'lavender', birthDate: '2018-10-06', birthYear: 2018, age: ageFromBirthDate('2018-10-06'), hasLicense: false, hasCar: false, availableForPickup: false, routines: [...weeklyCare('Itamar', 'בית ספר'), ...defaultFamilyRoutines.Itamar] },
    { id: 'noa', name: 'עומר', role: 'בן', color: 'butter', birthDate: '2021-12-30', birthYear: 2021, age: ageFromBirthDate('2021-12-30'), hasLicense: false, hasCar: false, availableForPickup: false, routines: [...weeklyCare('noa', 'בית ספר'), ...defaultFamilyRoutines.noa] },
    { id: 'yehonatan', name: 'יהונתן', role: 'בן', color: 'sage', birthDate: '2024-11-11', birthYear: 2024, age: ageFromBirthDate('2024-11-11'), hasLicense: false, hasCar: false, availableForPickup: false, routines: weeklyCare('yehonatan', 'מעון') },
  ] }],
  events: [
    { id: 'dentist', familyId: DEFAULT_FAMILY_ID, title: 'תור לרופא שיניים', date: localDate(), time: '10:30', icon: '🦷', participantIds: ['Mor'], responsibleId: 'Mor', details: 'מור הולכת לתור', priority: 'critical' },
    { id: 'dance', familyId: DEFAULT_FAMILY_ID, title: 'חוג ריקוד', date: localDate(), time: '16:00', icon: '💃', participantIds: ['noa', 'Mor'], responsibleId: 'Mor', details: 'מור מסיעה את עומר', requiresDriver: true },
    { id: 'football', familyId: DEFAULT_FAMILY_ID, title: 'אימון כדורגל', date: localDate(), time: '17:00', icon: '⚽', participantIds: ['Itamar', 'Orel'], responsibleId: 'Orel', details: 'אוראל מסיע - יציאה ב־16:32', requiresDriver: true },
    { id: 'traffic-pickup', familyId: DEFAULT_FAMILY_ID, title: 'איסוף איתמר מאימון', date: localDate(2), time: '17:00', icon: '🚗', participantIds: ['Itamar', 'Orel'], responsibleId: 'Orel', details: 'אוראל אחראי לאיסוף', requiresDriver: true },
    { id: 'dinner', familyId: DEFAULT_FAMILY_ID, title: 'ארוחת ערב משפחתית', date: localDate(), time: '19:30', icon: '🍽️', participantIds: ['Mor', 'Orel', 'Itamar', 'noa', 'yehonatan'], responsibleId: '', details: 'כולם יחד' },
    { id: 'grandma-babka', familyId: DEFAULT_FAMILY_ID, title: 'קובה אצל סבתא', date: nextFriday(), time: '12:00', endTime: '16:45', icon: '👵', participantIds: ['Mor', 'Orel', 'Itamar', 'noa', 'yehonatan'], responsibleId: '', details: 'קובה אצל סבתא' },
    { id: 'pickup', familyId: DEFAULT_FAMILY_ID, title: 'איסוף איתמר מכדורגל', date: localDate(4), time: '18:30', icon: '🚗', participantIds: ['Itamar'], responsibleId: '', details: 'דרוש נהג/ת לאיסוף', needsAttention: true, requiresDriver: true },
    { id: 'trip', familyId: DEFAULT_FAMILY_ID, title: 'טיול בית ספר', routineOverride: true, date: localDate(6), time: '08:00', icon: '🎒', participantIds: ['Itamar'], responsibleId: 'Mor', details: 'צפוי גשם - כדאי לקחת מעיל' },
  ],
  tasks: [
    { id: 'groceries', familyId: DEFAULT_FAMILY_ID, title: 'קניות לבית', ownerId: 'Mor', due: localDate(), done: false, requiresAdult: true, priority: 'low', flexible: true },
    { id: 'schoolbag', familyId: DEFAULT_FAMILY_ID, title: 'לארוז תיק לטיול', ownerId: 'Mor', due: localDate(5), done: false },
  ],
  activity: [
    { id: 'activity-1', familyId: DEFAULT_FAMILY_ID, text: 'נוספה תזכורת לאוראל על האימון', personIds: ['Orel'] },
    { id: 'activity-2', familyId: DEFAULT_FAMILY_ID, text: 'התור של מור מופיע בלוח המשפחתי', personIds: ['Mor'] },
  ],
  transportationRequests: [],
  integrationLogs: [],
  calendarMirrors: [],
  acknowledgements: [],
  suppressedRoutineTaskIds: [],
  pendingActions: [],
  dismissedActionIds: [],
  trafficSignals: [],
  externalSignals: [],
  liaInterventions: [],
  liaConversations: [],
}

/** Keeps persisted records tied to a real member of their own family unit. */
export function sanitizeAppData(data: AppData): AppData {
  const families = data.families.map(family => ({ ...family, people: family.people.map(person => ({
    ...person,
    personalSettings: normalizePersonalSettings(person.personalSettings),
    routines: mergeRoutineEntries(person.routines || []),
    ...(person.birthDate && validBirthDate(person.birthDate) ? { age: ageFromBirthDate(person.birthDate), birthYear: Number(person.birthDate.slice(0, 4)) } : {}),
  })) }))
  const membersByFamily = new Map(families.map(family => [family.id, new Set(family.people.map(person => person.id))]))
  const events = data.events.flatMap(event => {
    const members = membersByFamily.get(event.familyId)
    if (!members) return []
    const participantIds = [...new Set((event.participantIds || []).filter(id => members.has(id)))]
    const responsibleId = members.has(event.responsibleId) ? event.responsibleId : ''
    if (!participantIds.length && !responsibleId) return []
    return [{ ...event, participantIds, responsibleId, createdById: event.createdById && members.has(event.createdById) ? event.createdById : undefined, needsAttention: event.requiresDriver && !responsibleId ? true : event.needsAttention }]
  })
  const eventIds = new Set(events.map(event => event.id))
  const tasks = data.tasks.filter(task => membersByFamily.has(task.familyId) && (!task.eventId || eventIds.has(task.eventId)))
    .map(task => ({ ...task, ownerId: membersByFamily.get(task.familyId)!.has(task.ownerId) ? task.ownerId : '' }))
  const activity = data.activity.filter(entry => membersByFamily.has(entry.familyId))
    .map(entry => ({ ...entry, personIds: entry.personIds.filter(id => membersByFamily.get(entry.familyId)!.has(id)) }))
  const transportationRequests = (data.transportationRequests || []).filter(request => eventIds.has(request.eventId) && membersByFamily.has(request.familyId))
    .map(request => { const members = membersByFamily.get(request.familyId)!; const eligibleMemberIds = request.eligibleMemberIds.filter(id => members.has(id)); return { ...request, eligibleMemberIds, responses: Object.fromEntries(Object.entries(request.responses || {}).filter(([id]) => eligibleMemberIds.includes(id))), selectedDriverId: members.has(request.selectedDriverId) ? request.selectedDriverId : '' } })
  const integrationLogs = (data.integrationLogs || []).filter(entry => membersByFamily.has(entry.familyId) && (!entry.eventId || eventIds.has(entry.eventId)))
    .map(entry => ({ ...entry, personIds: entry.personIds.filter(id => membersByFamily.get(entry.familyId)!.has(id)) }))
  const calendarMirrors = (data.calendarMirrors || []).filter(entry => eventIds.has(entry.eventId) && membersByFamily.get(entry.familyId)?.has(entry.personId))
  const acknowledgements = (data.acknowledgements || []).filter(entry => eventIds.has(entry.eventId) && membersByFamily.get(events.find(event => event.id === entry.eventId)?.familyId || '')?.has(entry.personId))
  const liaInterventions = (data.liaInterventions || []).filter(item => membersByFamily.has(item.familyId)).map(item => {
    const relatedMemberIds = item.relatedMemberIds.filter(id => membersByFamily.get(item.familyId)!.has(id))
    return eventIds.has(item.relatedEventId || '') || !item.relatedEventId
      ? { ...item, relatedMemberIds }
      : { ...item, relatedMemberIds, status: 'noAction' as const, actions: [], resolvedAt: item.resolvedAt || new Date().toISOString(), resolutionType: 'eventRemoved' as const, resolutionSummary: 'האירוע המקושר נמחק; אין צורך בפעולה.' }
  })
  const externalSignals = (data.externalSignals || []).filter(signal => membersByFamily.has(signal.familyId) && membersByFamily.get(signal.familyId)?.has(signal.ownerMemberId))
  const interventionIds = new Set(liaInterventions.map(item => item.id))
  const liaConversations = (data.liaConversations || []).filter(item => membersByFamily.get(item.familyId)?.has(item.memberId)).map(item => {
    const members = membersByFamily.get(item.familyId)!
    const familyEventIds = new Set(events.filter(event => event.familyId === item.familyId).map(event => event.id))
    const pending = item.contextState?.pendingIntent
    const validPending = pending && familyEventIds.has(pending.relatedEventId) && members.has(pending.suggestedMemberId) ? pending : undefined
    const contextState = item.contextState ? {
      ...item.contextState,
      pendingIntent: validPending,
      lastEventId: item.contextState.lastEventId && familyEventIds.has(item.contextState.lastEventId) ? item.contextState.lastEventId : undefined,
      lastMemberId: item.contextState.lastMemberId && members.has(item.contextState.lastMemberId) ? item.contextState.lastMemberId : undefined,
      lastInterventionId: item.contextState.lastInterventionId && interventionIds.has(item.contextState.lastInterventionId) ? item.contextState.lastInterventionId : undefined,
    } : undefined
    const messages = validPending === pending ? item.messages : item.messages.map(entry => entry.action?.kind === 'sendRideRequest' && entry.status === 'sent' ? { ...entry, status: 'failed' as const } : entry)
    return { ...item, messages, contextState }
  })
  const trafficSignals = (data.trafficSignals || []).filter(signal => membersByFamily.has(signal.familyId) && eventIds.has(signal.relatedEventId))
  return { ...data, families, events, tasks, activity, transportationRequests, integrationLogs, calendarMirrors, acknowledgements, suppressedRoutineTaskIds: data.suppressedRoutineTaskIds || [], pendingActions: (data.pendingActions || []).filter(action => membersByFamily.has(action.familyId)), dismissedActionIds: data.dismissedActionIds || [], trafficSignals, externalSignals, liaInterventions, liaConversations }
}

/** Move the original demo family to its new ID without dropping local edits. */
export function migrateDefaultFamily(data: AppData): AppData {
  const original = data.families.find(family => family.id === 'cohen' || family.id === DEFAULT_FAMILY_ID)
  if (!original) return data
  const previousId = original.id
  const seedPeople = new Map(initialData.families[0].people.map(person => [person.id, person]))
  const familyId = (id: string) => id === previousId ? DEFAULT_FAMILY_ID : id
  const replaceKey = (value: string) => previousId === 'cohen' ? value.split('cohen').join(DEFAULT_FAMILY_ID) : value
  return {
    ...data,
    families: data.families.map(family => family !== original ? family : { ...family, id: DEFAULT_FAMILY_ID, people: family.people.map(person => {
      const seed = seedPeople.get(person.id)
      if (!seed) return person
      const birthDate = previousId === 'cohen' ? seed.birthDate : person.birthDate
      const routines = previousId === 'cohen' && seed.routines?.length && !(person.routines || []).some(routine => routine.kind === 'study') ? [...(person.routines || []), ...seed.routines] : person.routines
      return { ...person, birthDate, birthYear: birthDate ? Number(birthDate.slice(0, 4)) : person.birthYear, age: birthDate ? ageFromBirthDate(birthDate) : person.age, routines }
    }) }),
    events: data.events.map(event => ({ ...event, familyId: familyId(event.familyId) })),
    tasks: data.tasks.map(task => ({ ...task, familyId: familyId(task.familyId) })),
    activity: data.activity.map(entry => ({ ...entry, familyId: familyId(entry.familyId) })),
    transportationRequests: data.transportationRequests.map(request => ({ ...request, familyId: familyId(request.familyId) })),
    integrationLogs: data.integrationLogs.map(entry => ({ ...entry, familyId: familyId(entry.familyId), scenarioKey: entry.familyId === previousId ? replaceKey(entry.scenarioKey) : entry.scenarioKey })),
    calendarMirrors: data.calendarMirrors.map(entry => ({ ...entry, familyId: familyId(entry.familyId) })),
    externalSignals: (data.externalSignals || []).map(signal => signal.familyId === previousId ? { ...signal, familyId: DEFAULT_FAMILY_ID, id: replaceKey(signal.id) } : signal),
    pendingActions: (data.pendingActions || []).map(action => action.familyId === previousId ? { ...action, familyId: DEFAULT_FAMILY_ID, id: replaceKey(action.id) } : action),
    dismissedActionIds: (data.dismissedActionIds || []).map(replaceKey),
    liaConversations: (data.liaConversations || []).map(item => item.familyId === previousId ? { ...item, familyId: DEFAULT_FAMILY_ID } : item),
  }
}

export function readData(): AppData {
  try {
    const stored = JSON.parse(localStorage.getItem('family-autopilot-he-v1') || 'null') as AppData | null
    const legacy = stored?.families?.find(family => family.id === 'cohen' && family.name === 'משפחת כהן' && family.people.length === 4 && [['Mor', 'מאיה'], ['Orel', 'אדם'], ['Itamar', 'יובל'], ['noa', 'נועה']].every(([id, name]) => family.people.some(person => person.id === id && person.name === name)))
    const seedFamily = initialData.families[0]
    const saved = stored && legacy ? { ...stored,
      families: stored.families.map(family => family === legacy ? { ...family, name: seedFamily.name, people: [...family.people.map(person => { const seed = seedFamily.people.find(item => item.id === person.id)!; return { ...person, name: seed.name, role: seed.role, age: seed.age, birthYear: seed.birthYear } }), seedFamily.people.find(person => person.id === 'yehonatan')!] } : family),
      events: stored.events.map(event => event.familyId === 'cohen' && ['dentist', 'dance', 'football', 'pickup'].includes(event.id) ? { ...event, title: event.id === 'pickup' && event.title === 'איסוף יובל מכדורגל' ? 'איסוף איתמר מכדורגל' : event.title, details: event.details?.replace(/מאיה/g, 'מור').replace(/אדם/g, 'אוראל').replace(/נועה/g, 'עומר') || '' } : event),
      activity: stored.activity.map(entry => entry.familyId === 'cohen' && ['activity-1', 'activity-2'].includes(entry.id) ? { ...entry, text: entry.text.replace(/מאיה/g, 'מור').replace(/אדם/g, 'אוראל') } : entry),
    } : stored
    if (saved && Array.isArray(saved.families) && Array.isArray(saved.events) && Array.isArray(saved.tasks) && Array.isArray(saved.activity) && saved.families.length) {
      return sanitizeAppData(migrateDefaultFamily({
        ...saved,
        families: saved.families.map(family => ({ ...family, name: family.id === 'cohen' && (family.name === 'המשפחה של אוראל ומור' || family.name === 'משפחת כהן') ? seedFamily.name : cleanStoredText(family.name), people: family.people.map(person => {
          const seed = initialData.families.flatMap(item => item.people).find(item => item.id === person.id)
          const role = person.role === 'אם' || person.role.startsWith('אמא') ? 'אם' : person.role === 'אב' || person.role.startsWith('אבא') ? 'אב' : person.role.startsWith('בת') ? 'בת' : 'בן'
          return { ...person, name: cleanStoredText(person.name), role, age: person.birthDate && validBirthDate(person.birthDate) ? ageFromBirthDate(person.birthDate) : person.birthYear ? ageFromBirthYear(person.birthYear) : person.age ?? seed?.age ?? 0, hasLicense: person.hasLicense ?? seed?.hasLicense ?? false, hasCar: person.hasCar ?? seed?.hasCar ?? false, availableForPickup: person.availableForPickup ?? seed?.availableForPickup ?? false }
        }) })),
        events: saved.events.map(event => {
          const source = saved.integrationLogs?.find(entry => entry.eventId === event.id)?.source
          const sourceNote = event.sourceNote || (source === 'waze' ? 'זוהה עומס בוויז' : source === 'whatsapp' ? 'זוהתה הודעה בוואטסאפ' : source === 'school' ? 'זוהה עדכון מבית הספר' : source === 'university' ? 'זוהה עדכון מהאוניברסיטה' : undefined)
          return { ...event, title: cleanStoredText(event.title), sourceNote: sourceNote ? cleanStoredText(sourceNote) : undefined, issueReason: event.issueReason ? cleanStoredText(event.issueReason) : undefined, details: cleanStoredText((event.details || '').replace(/\s*(?:המדומה|מדומה|בהדגמה)\s*/g, ' ').replace(/\s+/g, ' ')), priority: event.priority || (event.id === 'dentist' ? 'critical' : 'normal'), requiresDriver: event.requiresDriver ?? (['dance', 'football', 'pickup'].includes(event.id) || /הסעה|מסיע|איסוף/.test(`${event.title} ${event.details}`)) }
        }),
        tasks: saved.tasks.map(task => ({ ...task, title: cleanStoredText(task.title), priority: task.priority || (task.id === 'groceries' ? 'low' : 'normal'), flexible: task.flexible ?? task.id === 'groceries', requiresAdult: task.requiresAdult ?? (/קני|רכיש|תשלום/.test(task.title)) })),
        activity: saved.activity.map(item => ({ ...item, text: cleanStoredText(item.text) })),
        transportationRequests: (saved.transportationRequests || []).map(request => ({ ...request, origin: cleanStoredText(request.origin), destination: cleanStoredText(request.destination) })),
        integrationLogs: (saved.integrationLogs || []).map(entry => ({ ...entry, sourceText: cleanStoredText(entry.sourceText), action: cleanStoredText(entry.action) })),
        calendarMirrors: saved.calendarMirrors || [],
        acknowledgements: saved.acknowledgements || [],
        suppressedRoutineTaskIds: saved.suppressedRoutineTaskIds || [],
        pendingActions: saved.pendingActions || [],
        dismissedActionIds: saved.dismissedActionIds || [],
        trafficSignals: saved.trafficSignals || [],
        externalSignals: saved.externalSignals || [],
        liaInterventions: saved.liaInterventions || [],
        liaConversations: saved.liaConversations || [],
      }))
    }
  } catch { /* use demo state */ }
  return sanitizeAppData(initialData)
}

export function removePersonAndTheirData(data: AppData, familyId: string, personId: string): AppData {
  const removedEventIds = new Set(data.events.filter(event => event.familyId === familyId &&
    (event.responsibleId === personId || event.participantIds.includes(personId) || event.createdById === personId)).map(event => event.id))
  return {
    families: data.families.map(family => family.id === familyId
      ? { ...family, people: family.people.filter(person => person.id !== personId) }
      : family),
    events: data.events.filter(event => !removedEventIds.has(event.id)),
    tasks: data.tasks.filter(task => task.familyId !== familyId || (task.ownerId !== personId && !removedEventIds.has(task.eventId || ''))),
    activity: data.activity.filter(entry => entry.familyId !== familyId || !entry.personIds.includes(personId)),
    transportationRequests: data.transportationRequests.filter(request => !removedEventIds.has(request.eventId)).map(request => request.familyId === familyId ? { ...request, eligibleMemberIds: request.eligibleMemberIds.filter(id => id !== personId), responses: Object.fromEntries(Object.entries(request.responses).filter(([id]) => id !== personId)), selectedDriverId: request.selectedDriverId === personId ? '' : request.selectedDriverId } : request),
    integrationLogs: data.integrationLogs.filter(entry => entry.familyId !== familyId || (!entry.personIds.includes(personId) && !removedEventIds.has(entry.eventId || ''))),
    calendarMirrors: data.calendarMirrors.filter(entry => entry.familyId !== familyId || (entry.personId !== personId && !removedEventIds.has(entry.eventId))),
    acknowledgements: (data.acknowledgements || []).filter(entry => entry.personId !== personId && !removedEventIds.has(entry.eventId)),
    suppressedRoutineTaskIds: data.suppressedRoutineTaskIds || [],
    pendingActions: data.pendingActions || [],
    dismissedActionIds: data.dismissedActionIds || [],
    trafficSignals: data.trafficSignals || [],
    externalSignals: (data.externalSignals || []).filter(item => item.familyId !== familyId || item.ownerMemberId !== personId),
    liaInterventions: (data.liaInterventions || []).filter(item => item.familyId !== familyId || !item.relatedMemberIds.includes(personId)),
    liaConversations: (data.liaConversations || []).filter(item => item.familyId !== familyId || item.memberId !== personId),
  }
}

export function detectScenario(text: string): 'birthday' | 'late' | 'reminder' | 'unknown' {
  if (/מאחר|מאחרת|מתעכב|מתעכבת|מאוחר|נתקע|נתקעתי|late|stuck/i.test(text)) return 'late'
  if (/יום הולדת|מסיב|עוגה|birthday|cake/i.test(text)) return 'birthday'
  if (/תזכיר|תזכורת/.test(text)) return 'reminder'
  return 'unknown'
}
