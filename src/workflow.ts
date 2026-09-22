import { localDate, type AppData, type EventAcknowledgement, type FamilyEvent, type Person, type WeeklyRoutine } from './data'
import { scanFutureRisks } from './forecast'

const minutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute }
export const routineDays = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
export const routineDaysList = (routine: WeeklyRoutine): number[] => {
  const explicitDays = Array.isArray(routine.days)
    ? routine.days.filter((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day < 7)
    : []
  if (explicitDays.length) return [...new Set(explicitDays)].sort((a, b) => a - b)
  if (typeof routine.day === 'number' && Number.isInteger(routine.day) && routine.day >= 0 && routine.day < 7) return [routine.day]
  return []
}
export const routineDaySegments = (days: number[]) => {
  if (!days.length) return [] as Array<{ start: number; end: number; label: string }>
  const unique = [...new Set(days)].sort((a, b) => a - b)
  const segments: Array<{ start: number; end: number; label: string }> = []
  let start = unique[0], prev = unique[0]
  for (let index = 1; index < unique.length; index++) {
    const current = unique[index]
    if (current === prev + 1) { prev = current; continue }
    segments.push({ start, end: prev, label: start === prev ? routineDays[start] : `${routineDays[start]}–${routineDays[prev]}` })
    start = current; prev = current
  }
  segments.push({ start, end: prev, label: start === prev ? routineDays[start] : `${routineDays[start]}–${routineDays[prev]}` })
  return segments
}
export const formatRoutineDayRange = (days: number[]) => {
  const segments = routineDaySegments(days)
  if (!segments.length) return 'לא נקבע'
  return segments.map(segment => segment.label).join(', ')
}

export function routineAt(person: Person, date: string, start: string, end: string): WeeklyRoutine | undefined {
  const day = new Date(`${date}T12:00:00`).getDay()
  return (person.routines || []).find(routine => routineDaysList(routine).includes(day) && minutes(start) < minutes(routine.end) && minutes(routine.start) <= minutes(end))
}

export function routineGroupKey(routine: Pick<WeeklyRoutine, 'kind' | 'start' | 'end'>): string {
  return `${routine.kind}|${routine.start}|${routine.end}`
}

export function routineDisplayRows(person: Pick<Person, 'id' | 'routines'>): Array<{ key: string; label: string; dayLabel: string; time: string; prepTitle?: string }> {
  const grouped = new Map<string, WeeklyRoutine>()
  for (const routine of person.routines || []) {
    const days = routineDaysList(routine)
    if (!days.length) continue
    const key = `${person.id}:${routineGroupKey(routine)}`
    const current = grouped.get(key)
    grouped.set(key, {
      ...routine,
      label: routine.label || current?.label || 'לו״ז קבוע',
      prepTitle: routine.prepTitle || current?.prepTitle,
      days: [...new Set([...(current?.days || []), ...days])].sort((a, b) => a - b),
    })
  }
  return [...grouped.values()].map(routine => ({
    key: `${person.id}:${routine.id}:${routine.start}:${routine.end}`,
    label: routine.label || 'לו״ז קבוע',
    dayLabel: formatRoutineDayRange(routine.days || routineDaysList(routine)),
    time: `${routine.start}–${routine.end}`,
    prepTitle: routine.prepTitle,
  }))
}

export function eventSignature(event: FamilyEvent): string {
  return [event.date, event.time, event.endTime || '', event.title, event.responsibleId, [...event.participantIds].sort().join(','), event.details, event.requiresDriver ? 'ride' : ''].join('|')
}

export function sensitiveAutomaticChange(before: AppData, after: AppData, familyId: string): boolean {
  return before.events.some(event => event.familyId === familyId && (!after.events.some(next => next.id === event.id) || event.priority === 'critical' && after.events.some(next => next.id === event.id && eventSignature(next) !== eventSignature(event))))
}

export function syncAcknowledgements(data: AppData): AppData {
  const previous = data.acknowledgements || []
  const next: EventAcknowledgement[] = []
  for (const event of data.events) {
    if (!event.createdById && !event.sourceNote) continue
    const duties = data.tasks.filter(task => task.eventId === event.id && task.responsibility)
    const signature = `${eventSignature(event)}|${duties.map(task => `${task.title}:${task.ownerId}`).sort().join(',')}`
    const people = new Set([...event.participantIds, event.responsibleId, ...duties.map(task => task.ownerId)].filter(Boolean))
    if (!event.sourceNote) people.delete(event.createdById || '')
    for (const personId of people) {
      const existing = previous.find(item => item.eventId === event.id && item.personId === personId && item.signature === signature)
      next.push(existing || { eventId: event.id, personId, signature, status: 'pending' })
    }
  }
  return JSON.stringify(previous) === JSON.stringify(next) ? data : { ...data, acknowledgements: next }
}

export function nextRepeatDate(due: string, days: number[]): string {
  const next = new Date(`${due >= localDate() ? due : localDate()}T12:00:00`)
  for (let offset = 1; offset <= 7; offset++) {
    next.setDate(next.getDate() + 1)
    if (days.includes(next.getDay())) return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
  }
  return due
}

export function materializeRoutineTasks(data: AppData, today = localDate()): AppData {
  const active = new Set(data.families.flatMap(family => family.people.flatMap(person => (person.routines || []).map(routine => routine.id))))
  let tasks = data.tasks.filter(task => !task.routineId || active.has(task.routineId))
  for (const family of data.families) for (const person of family.people) for (const routine of person.routines || []) {
    if (!routine.prepTitle?.trim()) continue
    const selectedDays = routineDaysList(routine)
    for (let offset = 0; offset <= 7; offset++) {
      const date = localDate(offset)
      const scheduledDay = new Date(`${date}T12:00:00`).getDay()
      if (!selectedDays.includes(scheduledDay)) continue
      const dueDate = new Date(`${date}T12:00:00`)
      if (routine.kind === 'study') dueDate.setDate(dueDate.getDate() - 1)
      const due = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`
      if (due < today) continue
      const id = `routine:${routine.id}:${date}`
      if (data.suppressedRoutineTaskIds?.includes(id)) continue
      const ownerId = family.people.some(member => member.id === routine.prepOwnerId) ? routine.prepOwnerId! : person.age < 18 ? family.people.find(member => member.age >= 18)?.id || person.id : person.id
      const existing = tasks.find(task => task.id === id)
      if (!existing) tasks = [...tasks, { id, familyId: family.id, title: routine.prepTitle.trim(), ownerId, due, done: false, priority: 'high', routineId: routine.id }]
    }
  }
  return JSON.stringify(tasks) === JSON.stringify(data.tasks) ? data : { ...data, tasks }
}

export function routineConflictingEvents(data: AppData, familyId: string, today = localDate()): FamilyEvent[] {
  const family = data.families.find(item => item.id === familyId)
  return data.events.filter(event => event.familyId === familyId && event.date >= today && !event.routineOverride && [...event.participantIds, event.responsibleId].filter(Boolean).some(id => {
    const person = family?.people.find(member => member.id === id)
    return person && routineAt(person, event.date, event.departureTime || event.time, event.endTime || event.time)
  }))
}

export function closureIssues(data: AppData, familyId: string, today = localDate()): string[] {
  const events = data.events.filter(event => event.familyId === familyId && event.date >= today)
  const forecasts = scanFutureRisks(data, familyId)
  const risks = forecasts.filter(risk => ['overlap', 'double-ride'].includes(risk.kind))
  const rideRisks = forecasts.filter(risk => risk.kind === 'ride')
  const routineConflicts = routineConflictingEvents(data, familyId, today)
  const unconfirmedRides = events.filter(event => event.requiresDriver && (!event.responsibleId || data.transportationRequests.some(request => request.eventId === event.id && request.status !== 'COVERED')))
  const importantTasks = data.tasks.filter(task => task.familyId === familyId && !task.done && ['high', 'critical'].includes(task.priority || 'normal') && !task.ownerId)
  const pendingApprovals = (data.acknowledgements || []).filter(item => item.status !== 'approved' && data.events.some(event => event.id === item.eventId && event.familyId === familyId))
  const unhandledUpdates = data.integrationLogs.filter(log => log.familyId === familyId && !log.handledAt)
  const pendingActions = (data.pendingActions || []).filter(action => action.familyId === familyId)
  return [
    ...(risks.length ? [`${risks.length} התנגשויות בלוח`] : []),
    ...(routineConflicts.length ? [`${routineConflicts.length} אירועים חופפים ללו״ז קבוע`] : []),
    ...(unconfirmedRides.length ? [`${unconfirmedRides.length} הסעות ללא פתרון מאושר`] : []),
    ...(rideRisks.length ? [`${rideRisks.length} הסעות עם סיכון בזמינות`] : []),
    ...(importantTasks.length ? [`${importantTasks.length} משימות חשובות ללא אחראי/ת`] : []),
    ...(pendingApprovals.length ? [`${pendingApprovals.length} אישורים שטרם התקבלו`] : []),
    ...(unhandledUpdates.length ? [`${unhandledUpdates.length} עדכונים חיצוניים לטיפול`] : []),
    ...(pendingActions.length ? [`${pendingActions.length} פעולות רגישות לאישור`] : []),
  ]
}
