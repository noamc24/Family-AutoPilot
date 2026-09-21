import { dateLabel, localDate, uid, type AppData, type FamilyEvent, type Person } from './data'
import { eligibleDrivers, ensureRequests, requestForEvent } from './coordination'
import { pickupIneligibility, saveEventAndDependents } from './domain'

export type ForecastRisk = { id: string; kind: 'ride' | 'overlap' | 'double-ride' | 'task' | 'busy-day'; eventId: string; taskId?: string; title: string; detail: string; date: string; time: string; sourceNote?: string }
export type ForecastSolution = { kind: 'time' | 'task'; title: string; reason: string; date?: string; time?: string; taskId?: string }
const minutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute }
const clock = (value: number) => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
const nextDate = (date: string) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + 1); return localDateFrom(value) }
const localDateFrom = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const eventStart = (event: FamilyEvent) => minutes(event.departureTime || event.time)
const eventEnd = (event: FamilyEvent) => minutes(event.endTime || event.time) + (event.endTime ? 0 : event.requiresDriver ? 25 : 45)
const peopleFor = (event: FamilyEvent) => new Set([...event.participantIds, event.responsibleId].filter(Boolean))
const sharePerson = (left: FamilyEvent, right: FamilyEvent) => [...peopleFor(left)].some(id => peopleFor(right).has(id))
const overlaps = (left: FamilyEvent, right: FamilyEvent) => left.date === right.date && sharePerson(left, right) && eventStart(left) < eventEnd(right) + 10 && eventStart(right) < eventEnd(left) + 10
const future = (event: FamilyEvent, now: Date) => new Date(`${event.date}T${event.time}:00`).getTime() > now.getTime() + 2 * 60 * 60_000 && event.date <= localDate(14)
const personName = (data: AppData, event: FamilyEvent, id: string) => data.families.find(f => f.id === event.familyId)?.people.find(p => p.id === id)?.name || 'בן משפחה'

export function scanFutureRisks(data: AppData, familyId: string, now = new Date()): ForecastRisk[] {
  const events = data.events.filter(event => event.familyId === familyId && future(event, now)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  const risks: ForecastRisk[] = []
  for (const event of events) {
    const base = { eventId: event.id, date: event.date, time: event.time, sourceNote: event.sourceNote }
    if (event.requiresDriver) {
      const request = requestForEvent(data, event.id)
      const available = eligibleDrivers(data, event)
      if (!event.responsibleId && !available.length) risks.push({ ...base, id: `ride:${event.id}`, kind: 'ride', title: `צפויה בעיית הסעה ${dateLabel(event.date)} ב-${event.time}`, detail: `אין כרגע נהג פנוי עם רישיון ורכב להסעה ל${event.title}.` })
      else if (!event.responsibleId && request && !request.selectedDriverId && !Object.values(request.responses).includes('CAN_DO')) risks.push({ ...base, id: `ride:${event.id}`, kind: 'ride', title: `ההסעה ל${event.title} עדיין לא אושרה`, detail: `${dateLabel(event.date)} ב-${event.time} נדרש נהג. בקשת ההסעה ממתינה לתשובה.` })
      else if (event.responsibleId) {
        const driver = data.families.find(f => f.id === familyId)?.people.find(p => p.id === event.responsibleId)
        if (driver && pickupIneligibility(driver, event, data)) risks.push({ ...base, id: `ride:${event.id}`, kind: 'ride', title: `${personName(data, event, driver.id)} עלול/ה לא להספיק להסעה`, detail: `${dateLabel(event.date)} ב-${event.time}. ${pickupIneligibility(driver, event, data)}.` })
      }
    }
    for (const other of events) {
      const sameDriver = event.requiresDriver && other.requiresDriver && !!event.responsibleId && event.responsibleId === other.responsibleId
      const ridesTooClose = sameDriver && Math.abs(minutes(event.time) - minutes(other.time)) < 90
      if (other.id >= event.id || !(overlaps(event, other) || ridesTooClose)) continue
      risks.push({ ...base, id: `overlap:${[event.id, other.id].sort().join(':')}`, kind: sameDriver ? 'double-ride' : 'overlap', title: sameDriver ? `שתי הסעות קרובות מדי ${dateLabel(event.date)}` : `צפויה חפיפה בין אירועים ${dateLabel(event.date)}`, detail: sameDriver ? `${personName(data, event, event.responsibleId)} משובץ לשתי הסעות בהפרש קצר: ${event.title} ו${other.title}.` : `${event.title} ו${other.title} מתוכננים בזמנים חופפים עבור בן משפחה משותף.${event.departureTime || other.departureTime ? ' שעת היציאה נלקחה בחשבון.' : ''}`, sourceNote: event.sourceNote || other.sourceNote })
    }
    const importantTask = data.tasks.find(task => task.familyId === familyId && task.due === event.date && !task.done && task.requiresAdult && !!task.ownerId && (event.responsibleId === task.ownerId || event.participantIds.includes(task.ownerId)))
    if (importantTask && data.events.filter(item => item.familyId === familyId && item.date === event.date && (item.responsibleId === importantTask.ownerId || item.participantIds.includes(importantTask.ownerId))).length >= 2) {
      risks.push({ ...base, id: `task:${importantTask.id}`, kind: 'task', taskId: importantTask.id, title: `יום עמוס ל${personName(data, event, importantTask.ownerId)}`, detail: `המשימה "${importantTask.title}" מתוכננת לאותו יום עם כמה אירועים. כדאי להזיז אותה מראש.` })
    }
  }
  const ridesByDate = new Map<string, FamilyEvent[]>()
  for (const event of events.filter(item => item.requiresDriver)) ridesByDate.set(event.date, [...(ridesByDate.get(event.date) || []), event])
  for (const [date, rides] of ridesByDate) if (rides.length >= 3) risks.push({ id: `busy:${familyId}:${date}`, kind: 'busy-day', eventId: rides[rides.length - 1].id, date, time: rides[0].time, title: `יום עמוס בהסעות ${dateLabel(date)}`, detail: `מתוכננות ${rides.length} הסעות באותו יום. כדאי לוודא מראש מי אחראי לכל אחת.` })
  return risks.filter((risk, index, all) => all.findIndex(item => item.id === risk.id) === index).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
}

export function suggestForecastSolution(data: AppData, risk: ForecastRisk): ForecastSolution | null {
  const event = data.events.find(item => item.id === risk.eventId)
  if (!event) return null
  if (risk.kind === 'ride' && eligibleDrivers(data, event).length > 0 && !event.responsibleId) return null
  if (risk.kind === 'task' && risk.taskId) {
    const task = data.tasks.find(item => item.id === risk.taskId)
    if (!task || task.flexible === false || task.priority === 'critical' || task.priority === 'high' || data.families.find(family => family.id === task.familyId)?.preferences?.moveFlexibleTasks === false) return null
    const due = nextDate(task.due)
    return { kind: 'task', title: `לדחות את המשימה "${task.title}" ל${dateLabel(due)}`, reason: 'דחיית המשימה מפנה זמן ביום העמוס. האחריות נשארת אצל אותו בן משפחה.', date: due, taskId: task.id }
  }
  if (event.priority === 'critical') return null
  for (const date of risk.kind === 'busy-day' ? [nextDate(event.date)] : [event.date, nextDate(event.date)]) {
    for (const offset of [30, 45, 60, 75, 90, 120, 150, 180]) {
      const time = clock(minutes(event.time) + offset)
      if (date === event.date && minutes(time) <= minutes(event.time)) continue
      const candidate = { ...event, date, time, departureTime: event.departureTime ? clock(minutes(event.departureTime) + offset) : undefined }
      const conflicts = data.events.some(other => other.id !== event.id && other.familyId === event.familyId && overlaps(candidate, other))
      const driverAvailable = !candidate.requiresDriver || data.families.find(f => f.id === candidate.familyId)?.people.some((person: Person) => !pickupIneligibility(person, candidate, data))
      if (!conflicts && driverAvailable) return { kind: 'time', title: `להעביר את ${event.title} ל${dateLabel(date)} ב-${time}`, reason: 'במועד המוצע אין חפיפה בלוח, ויש לפחות נהג כשיר שניתן לבקש ממנו אישור. השינוי יפתח מחדש את בקשת ההסעה אם צריך.', date, time }
    }
  }
  return null
}

export function applyForecastSolution(data: AppData, risk: ForecastRisk): AppData {
  const solution = suggestForecastSolution(data, risk)
  if (!solution) return data
  if (solution.kind === 'task' && solution.taskId && solution.date) return { ...data, tasks: data.tasks.map(task => task.id === solution.taskId ? { ...task, due: solution.date! } : task), activity: [{ id: uid(), familyId: data.tasks.find(task => task.id === solution.taskId)!.familyId, text: solution.title, personIds: [data.tasks.find(task => task.id === solution.taskId)!.ownerId], createdAt: new Date().toISOString() }, ...data.activity] }
  const event = data.events.find(item => item.id === risk.eventId)
  if (!event || !solution.date || !solution.time) return data
  const offset = minutes(solution.time) - minutes(event.time)
  const updated = { ...event, date: solution.date, time: solution.time, departureTime: event.departureTime ? clock(minutes(event.departureTime) + offset) : undefined, responsibleId: event.requiresDriver ? '' : event.responsibleId, needsAttention: event.requiresDriver, issueReason: undefined }
  const saved = saveEventAndDependents(data, updated)
  const requests = saved.transportationRequests.map(request => request.eventId === event.id ? { ...request, selectedDriverId: '', responses: Object.fromEntries(request.eligibleMemberIds.map(id => [id, 'PENDING' as const])), status: 'OPEN' as const } : request)
  return ensureRequests({ ...saved, transportationRequests: requests, activity: [{ id: uid(), familyId: event.familyId, text: solution.title, personIds: event.participantIds, createdAt: new Date().toISOString() }, ...saved.activity] }, event.createdById || event.participantIds[0] || '')
}
