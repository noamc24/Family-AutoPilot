export type Person = { id: string; name: string; role: 'אב' | 'אם' | 'בן' | 'בת'; color: string; age: number; hasLicense: boolean; hasCar: boolean; availableForPickup: boolean; availability?: 'available' | 'work' | 'travel' | 'unavailable'; unavailableUntil?: string }
export type FamilyUnit = { id: string; name: string; people: Person[] }
export type FamilyEvent = { id: string; familyId: string; title: string; date: string; time: string; icon: string; participantIds: string[]; responsibleId: string; details: string; needsAttention?: boolean; requiresDriver?: boolean }
export type FamilyTask = { id: string; familyId: string; title: string; ownerId: string; due: string; done: boolean; eventId?: string; requiresAdult?: boolean }
export type Activity = { id: string; familyId: string; text: string; personIds: string[] }
export type TransportationRequest = { id: string; familyId: string; eventId: string; passengerId: string; eligibleMemberIds: string[]; responses: Record<string, 'PENDING' | 'CAN_DO' | 'CANNOT_DO'>; selectedDriverId: string; status: 'OPEN' | 'PARTIALLY_RESPONDED' | 'COVERED' | 'UNRESOLVED' | 'CANCELLED'; createdById: string; origin: string; destination: string; requiredAt: string }
export type AppData = { families: FamilyUnit[]; events: FamilyEvent[]; tasks: FamilyTask[]; activity: Activity[]; transportationRequests: TransportationRequest[] }

export const uid = () => Math.random().toString(36).slice(2, 10)
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

export const initialData: AppData = {
  families: [{ id: 'cohen', name: 'משפחת כהן', people: [
    { id: 'maya', name: 'מאיה', role: 'אם', color: 'peach', age: 39, hasLicense: true, hasCar: true, availableForPickup: true },
    { id: 'adam', name: 'אדם', role: 'אב', color: 'sage', age: 41, hasLicense: true, hasCar: true, availableForPickup: true },
    { id: 'yuval', name: 'יובל', role: 'בן', color: 'lavender', age: 10, hasLicense: false, hasCar: false, availableForPickup: false },
    { id: 'noa', name: 'נועה', role: 'בת', color: 'butter', age: 7, hasLicense: false, hasCar: false, availableForPickup: false },
  ] }],
  events: [
    { id: 'dentist', familyId: 'cohen', title: 'תור לרופא שיניים', date: localDate(), time: '10:30', icon: '🦷', participantIds: ['maya'], responsibleId: 'maya', details: 'מאיה הולכת לתור' },
    { id: 'dance', familyId: 'cohen', title: 'חוג ריקוד', date: localDate(), time: '16:00', icon: '💃', participantIds: ['noa', 'maya'], responsibleId: 'maya', details: 'מאיה מסיעה את נועה', requiresDriver: true },
    { id: 'football', familyId: 'cohen', title: 'אימון כדורגל', date: localDate(), time: '17:00', icon: '⚽', participantIds: ['yuval', 'adam'], responsibleId: 'adam', details: 'אדם מסיע · יציאה ב־16:32', requiresDriver: true },
    { id: 'dinner', familyId: 'cohen', title: 'ארוחת ערב משפחתית', date: localDate(), time: '19:30', icon: '🍽️', participantIds: ['maya', 'adam', 'yuval', 'noa'], responsibleId: '', details: 'כולם יחד' },
    { id: 'pickup', familyId: 'cohen', title: 'איסוף יובל מכדורגל', date: localDate(4), time: '18:30', icon: '🚗', participantIds: ['yuval'], responsibleId: '', details: 'דרוש נהג/ת לאיסוף', needsAttention: true, requiresDriver: true },
    { id: 'trip', familyId: 'cohen', title: 'טיול בית ספר', date: localDate(6), time: '08:00', icon: '🎒', participantIds: ['yuval'], responsibleId: 'maya', details: 'צפוי גשם · כדאי לארוז מעיל' },
  ],
  tasks: [
    { id: 'groceries', familyId: 'cohen', title: 'קניות לבית', ownerId: 'maya', due: localDate(), done: false, requiresAdult: true },
    { id: 'schoolbag', familyId: 'cohen', title: 'לארוז תיק לטיול', ownerId: 'maya', due: localDate(5), done: false },
  ],
  activity: [
    { id: 'activity-1', familyId: 'cohen', text: 'נוספה תזכורת לאדם על האימון', personIds: ['adam'] },
    { id: 'activity-2', familyId: 'cohen', text: 'התור של מאיה מופיע בלוח המשפחתי', personIds: ['maya'] },
  ],
  transportationRequests: [],
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
    return [{ ...event, participantIds, responsibleId, needsAttention: event.requiresDriver && !responsibleId ? true : event.needsAttention }]
  })
  const eventIds = new Set(events.map(event => event.id))
  const tasks = data.tasks.filter(task => membersByFamily.has(task.familyId) && (!task.eventId || eventIds.has(task.eventId)))
    .map(task => ({ ...task, ownerId: membersByFamily.get(task.familyId)!.has(task.ownerId) ? task.ownerId : '' }))
  const activity = data.activity.filter(entry => membersByFamily.has(entry.familyId))
    .map(entry => ({ ...entry, personIds: entry.personIds.filter(id => membersByFamily.get(entry.familyId)!.has(id)) }))
  const transportationRequests = (data.transportationRequests || []).filter(request => eventIds.has(request.eventId) && membersByFamily.has(request.familyId))
    .map(request => { const members = membersByFamily.get(request.familyId)!; const eligibleMemberIds = request.eligibleMemberIds.filter(id => members.has(id)); return { ...request, eligibleMemberIds, responses: Object.fromEntries(Object.entries(request.responses || {}).filter(([id]) => eligibleMemberIds.includes(id))), selectedDriverId: members.has(request.selectedDriverId) ? request.selectedDriverId : '' } })
  return { ...data, events, tasks, activity, transportationRequests }
}

export function readData(): AppData {
  try {
    const saved = JSON.parse(localStorage.getItem('family-autopilot-he-v1') || 'null') as AppData | null
    if (saved && Array.isArray(saved.families) && Array.isArray(saved.events) && Array.isArray(saved.tasks) && Array.isArray(saved.activity) && saved.families.length) {
      return sanitizeAppData({
        ...saved,
        families: saved.families.map(family => ({ ...family, people: family.people.map(person => {
          const seed = initialData.families.flatMap(item => item.people).find(item => item.id === person.id)
          const role = person.role === 'אם' || person.role.startsWith('אמא') ? 'אם' : person.role === 'אב' || person.role.startsWith('אבא') ? 'אב' : person.role.startsWith('בת') ? 'בת' : 'בן'
          return { ...person, role, age: person.age ?? seed?.age ?? 0, hasLicense: person.hasLicense ?? seed?.hasLicense ?? false, hasCar: person.hasCar ?? seed?.hasCar ?? false, availableForPickup: person.availableForPickup ?? seed?.availableForPickup ?? false }
        }) })),
        events: saved.events.map(event => ({ ...event, requiresDriver: event.requiresDriver ?? (['dance', 'football', 'pickup'].includes(event.id) || /הסעה|מסיע|איסוף/.test(`${event.title} ${event.details}`)) })),
        tasks: saved.tasks.map(task => ({ ...task, requiresAdult: task.requiresAdult ?? (/קני|רכיש|תשלום/.test(task.title)) })),
        transportationRequests: saved.transportationRequests || [],
      })
    }
  } catch { /* use demo state */ }
  return sanitizeAppData(initialData)
}

export function removePersonAndTheirData(data: AppData, familyId: string, personId: string): AppData {
  const removedEventIds = new Set(data.events.filter(event => event.familyId === familyId &&
    (event.responsibleId === personId || event.participantIds.includes(personId))).map(event => event.id))
  return {
    families: data.families.map(family => family.id === familyId
      ? { ...family, people: family.people.filter(person => person.id !== personId) }
      : family),
    events: data.events.filter(event => !removedEventIds.has(event.id)),
    tasks: data.tasks.filter(task => task.familyId !== familyId || (task.ownerId !== personId && !removedEventIds.has(task.eventId || ''))),
    activity: data.activity.filter(entry => entry.familyId !== familyId || !entry.personIds.includes(personId)),
    transportationRequests: data.transportationRequests.filter(request => !removedEventIds.has(request.eventId)).map(request => request.familyId === familyId ? { ...request, eligibleMemberIds: request.eligibleMemberIds.filter(id => id !== personId), responses: Object.fromEntries(Object.entries(request.responses).filter(([id]) => id !== personId)), selectedDriverId: request.selectedDriverId === personId ? '' : request.selectedDriverId } : request),
  }
}

export function detectScenario(text: string): 'birthday' | 'late' | 'reminder' | 'unknown' {
  if (/מאחר|מאחרת|מתעכב|מתעכבת|מאוחר|נתקע|נתקעתי|late|stuck/i.test(text)) return 'late'
  if (/יום הולדת|מסיב|עוגה|birthday|cake/i.test(text)) return 'birthday'
  if (/תזכיר|תזכורת/.test(text)) return 'reminder'
  return 'unknown'
}
