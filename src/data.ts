export type Priority = 'low' | 'normal' | 'high' | 'critical'
export type FamilyPreferences = { preferFewerTrips?: boolean; balanceRides?: boolean; preferNearbyDriver?: boolean; moveFlexibleTasks?: boolean; allowPublicTransit?: boolean }
export type Person = { id: string; name: string; role: 'אב' | 'אם' | 'בן' | 'בת'; color: string; age: number; birthYear?: number; hasLicense: boolean; hasCar: boolean; availableForPickup: boolean; availability?: 'available' | 'home' | 'work' | 'travel' | 'unavailable'; unavailableUntil?: string; travelMinutes?: number; activeDriver?: boolean; unavailableFrom?: string; unavailableTo?: string; preferredMaxRides?: number; lastResortDriver?: boolean; canUseTransit?: boolean; canTravelAlone?: boolean }
export type FamilyUnit = { id: string; name: string; people: Person[]; preferences?: FamilyPreferences }
export type FamilyEvent = { id: string; familyId: string; title: string; date: string; time: string; endTime?: string; icon: string; participantIds: string[]; responsibleId: string; details: string; needsAttention?: boolean; requiresDriver?: boolean; departureTime?: string; routeMinutes?: number; createdById?: string; issueReason?: string; sourceNote?: string; priority?: Priority; preferredDriverId?: string; transitAvailable?: boolean }
export type FamilyTask = { id: string; familyId: string; title: string; ownerId: string; due: string; done: boolean; eventId?: string; requiresAdult?: boolean; priority?: Priority; flexible?: boolean }
export type Activity = { id: string; familyId: string; text: string; personIds: string[]; createdAt?: string; source?: IntegrationSource; eventId?: string }
export type TransportationRequest = { id: string; familyId: string; eventId: string; passengerId: string; eligibleMemberIds: string[]; responses: Record<string, 'PENDING' | 'CAN_DO' | 'CANNOT_DO'>; selectedDriverId: string; status: 'OPEN' | 'PARTIALLY_RESPONDED' | 'COVERED' | 'UNRESOLVED' | 'CANCELLED'; createdById: string; origin: string; destination: string; requiredAt: string }
export type IntegrationSource = 'waze' | 'whatsapp' | 'school' | 'university' | 'family' | 'calendar' | 'email' | 'weather' | 'location' | 'work' | 'club' | 'transit'
export type IntegrationLog = { id: string; familyId: string; scenarioKey: string; source: IntegrationSource; sourceText: string; action: string; personIds: string[]; eventId?: string; createdAt: string; trigger?: 'manual' | 'automatic' }
export type CalendarMirror = { id: string; familyId: string; eventId: string; personId: string; provider: 'google'; createdAt: string }
export type AppData = { families: FamilyUnit[]; events: FamilyEvent[]; tasks: FamilyTask[]; activity: Activity[]; transportationRequests: TransportationRequest[]; integrationLogs: IntegrationLog[]; calendarMirrors: CalendarMirror[] }

export const uid = () => Math.random().toString(36).slice(2, 10)
export const ageFromBirthYear = (year: number) => new Date().getFullYear() - year
export const localDate = (offset = 0) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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

export const initialData: AppData = {
  families: [{ id: 'cohen', name: 'משפחת אברהמי', people: [
    { id: 'adam', name: 'אוראל', role: 'אב', color: 'sage', birthYear: 1988, age: ageFromBirthYear(1988), hasLicense: true, hasCar: true, availableForPickup: true },
    { id: 'maya', name: 'מור', role: 'אם', color: 'peach', birthYear: 1993, age: ageFromBirthYear(1993), hasLicense: true, hasCar: true, availableForPickup: true },
    { id: 'yuval', name: 'איתמר', role: 'בן', color: 'lavender', birthYear: 2018, age: ageFromBirthYear(2018), hasLicense: false, hasCar: false, availableForPickup: false },
    { id: 'noa', name: 'עומר', role: 'בן', color: 'butter', birthYear: 2020, age: ageFromBirthYear(2020), hasLicense: false, hasCar: false, availableForPickup: false },
    { id: 'yehonatan', name: 'יהונתן', role: 'בן', color: 'sage', birthYear: 2022, age: ageFromBirthYear(2022), hasLicense: false, hasCar: false, availableForPickup: false },
  ] }],
  events: [
    { id: 'dentist', familyId: 'cohen', title: 'תור לרופא שיניים', date: localDate(), time: '10:30', icon: '🦷', participantIds: ['maya'], responsibleId: 'maya', details: 'מור הולכת לתור', priority: 'critical' },
    { id: 'dance', familyId: 'cohen', title: 'חוג ריקוד', date: localDate(), time: '16:00', icon: '💃', participantIds: ['noa', 'maya'], responsibleId: 'maya', details: 'מור מסיעה את עומר', requiresDriver: true },
    { id: 'football', familyId: 'cohen', title: 'אימון כדורגל', date: localDate(), time: '17:00', icon: '⚽', participantIds: ['yuval', 'adam'], responsibleId: 'adam', details: 'אוראל מסיע · יציאה ב־16:32', requiresDriver: true },
    { id: 'dinner', familyId: 'cohen', title: 'ארוחת ערב משפחתית', date: localDate(), time: '19:30', icon: '🍽️', participantIds: ['maya', 'adam', 'yuval', 'noa', 'yehonatan'], responsibleId: '', details: 'כולם יחד' },
    { id: 'pickup', familyId: 'cohen', title: 'איסוף איתמר מכדורגל', date: localDate(4), time: '18:30', icon: '🚗', participantIds: ['yuval'], responsibleId: '', details: 'דרוש נהג/ת לאיסוף', needsAttention: true, requiresDriver: true },
    { id: 'trip', familyId: 'cohen', title: 'טיול בית ספר', date: localDate(6), time: '08:00', icon: '🎒', participantIds: ['yuval'], responsibleId: 'maya', details: 'צפוי גשם · כדאי לארוז מעיל' },
  ],
  tasks: [
    { id: 'groceries', familyId: 'cohen', title: 'קניות לבית', ownerId: 'maya', due: localDate(), done: false, requiresAdult: true, priority: 'low', flexible: true },
    { id: 'schoolbag', familyId: 'cohen', title: 'לארוז תיק לטיול', ownerId: 'maya', due: localDate(5), done: false },
  ],
  activity: [
    { id: 'activity-1', familyId: 'cohen', text: 'נוספה תזכורת לאוראל על האימון', personIds: ['adam'] },
    { id: 'activity-2', familyId: 'cohen', text: 'התור של מור מופיע בלוח המשפחתי', personIds: ['maya'] },
  ],
  transportationRequests: [],
  integrationLogs: [],
  calendarMirrors: [],
}

/** Keeps persisted records tied to a real member of their own family unit. */
export function sanitizeAppData(data: AppData): AppData {
  const membersByFamily = new Map(data.families.map(family => [family.id, new Set(family.people.map(person => person.id))]))
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
  return { ...data, events, tasks, activity, transportationRequests, integrationLogs, calendarMirrors }
}

export function readData(): AppData {
  try {
    const stored = JSON.parse(localStorage.getItem('family-autopilot-he-v1') || 'null') as AppData | null
    const legacy = stored?.families?.find(family => family.id === 'cohen' && family.name === 'משפחת כהן' && family.people.length === 4 && [['maya', 'מאיה'], ['adam', 'אדם'], ['yuval', 'יובל'], ['noa', 'נועה']].every(([id, name]) => family.people.some(person => person.id === id && person.name === name)))
    const seedFamily = initialData.families[0]
    const saved = stored && legacy ? { ...stored,
      families: stored.families.map(family => family === legacy ? { ...family, name: seedFamily.name, people: [...family.people.map(person => { const seed = seedFamily.people.find(item => item.id === person.id)!; return { ...person, name: seed.name, role: seed.role, age: seed.age, birthYear: seed.birthYear } }), seedFamily.people.find(person => person.id === 'yehonatan')!] } : family),
      events: stored.events.map(event => event.familyId === 'cohen' && ['dentist', 'dance', 'football', 'pickup'].includes(event.id) ? { ...event, title: event.id === 'pickup' && event.title === 'איסוף יובל מכדורגל' ? 'איסוף איתמר מכדורגל' : event.title, details: event.details?.replace(/מאיה/g, 'מור').replace(/אדם/g, 'אוראל').replace(/נועה/g, 'עומר') || '' } : event),
      activity: stored.activity.map(entry => entry.familyId === 'cohen' && ['activity-1', 'activity-2'].includes(entry.id) ? { ...entry, text: entry.text.replace(/מאיה/g, 'מור').replace(/אדם/g, 'אוראל') } : entry),
    } : stored
    if (saved && Array.isArray(saved.families) && Array.isArray(saved.events) && Array.isArray(saved.tasks) && Array.isArray(saved.activity) && saved.families.length) {
      return sanitizeAppData({
        ...saved,
        families: saved.families.map(family => ({ ...family, name: family.id === 'cohen' && (family.name === 'המשפחה של אוראל ומור' || family.name === 'משפחת כהן') ? seedFamily.name : cleanStoredText(family.name), people: family.people.map(person => {
          const seed = initialData.families.flatMap(item => item.people).find(item => item.id === person.id)
          const role = person.role === 'אם' || person.role.startsWith('אמא') ? 'אם' : person.role === 'אב' || person.role.startsWith('אבא') ? 'אב' : person.role.startsWith('בת') ? 'בת' : 'בן'
          return { ...person, name: cleanStoredText(person.name), role, age: person.birthYear ? ageFromBirthYear(person.birthYear) : person.age ?? seed?.age ?? 0, hasLicense: person.hasLicense ?? seed?.hasLicense ?? false, hasCar: person.hasCar ?? seed?.hasCar ?? false, availableForPickup: person.availableForPickup ?? seed?.availableForPickup ?? false }
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
      })
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
  }
}

export function detectScenario(text: string): 'birthday' | 'late' | 'reminder' | 'unknown' {
  if (/מאחר|מאחרת|מתעכב|מתעכבת|מאוחר|נתקע|נתקעתי|late|stuck/i.test(text)) return 'late'
  if (/יום הולדת|מסיב|עוגה|birthday|cake/i.test(text)) return 'birthday'
  if (/תזכיר|תזכורת/.test(text)) return 'reminder'
  return 'unknown'
}
