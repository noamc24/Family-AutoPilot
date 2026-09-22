import { localDate, type AppData, type EventAcknowledgement, type FamilyEvent, type Person, type WeeklyRoutine } from './data'
import { scanFutureRisks } from './forecast'

const minutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute }
export const routineDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const routineDaysList = (routine: WeeklyRoutine): number[] => {
  const explicitDays = Array.isArray(routine.days)
    ? routine.days.filter((day): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day < 7)
    : []
  if (explicitDays.length) return [...new Set(explicitDays)].sort((a, b) => a - b)
  if (typeof routine.day === 'number' && Number.isInteger(routine.day) && routine.day >= 0 && routine.day < 7) return [routine.day]
  return []
}
export const formatRoutineDayRange = (days: number[]) => {
  if (!days.length) return 'לא נקבע'
  if (days.length === 1) return routineDays[days[0]]
  const ranges: string[] = []
  let start = days[0], prev = days[0]
  for (let index = 1; index < days.length; index++) {
    const current = days[index]
    if (current === prev + 1) prev = current
    else { ranges.push(start === prev ? routineDays[start] : `${routineDays[start]}–${routineDays[prev]}`); start = current; prev = current }
  }
  ranges.push(start === prev ? routineDays[start] : `${routineDays[start]}–${routineDays[prev]}`)
  return ranges.join(', ')
}

export function routineAt(person: Person, date: string, start: string, end: string): WeeklyRoutine | undefined {
  const day = new Date(`${date}T12:00:00`).getDay()
  return (person.routines || []).find(routine => routineDaysList(routine).includes(day) && minutes(start) < minutes(routine.end) && minutes(routine.start) <= minutes(end))
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
