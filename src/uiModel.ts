import type { FamilyEvent, FamilyTask, Person } from './data'

export type CalendarGrouping = 'personal' | 'family'
export type CalendarDisplay = 'table' | 'rows'
export type CalendarRange = 'day' | 'week' | 'month' | 'year'

export const defaultCalendarView = { grouping: 'personal' as CalendarGrouping, display: 'table' as CalendarDisplay, range: 'month' as CalendarRange }

export function homeGreeting(person: Pick<Person, 'name' | 'role'>, date = new Date()): string {
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes >= 150 && minutes < 300) return person.role === 'אם' || person.role === 'בת' ? 'לכי לישון 😅' : 'לך לישון 😅'
  if (minutes < 150) return `לילה טוב ${person.name}`
  if (minutes >= 300 && minutes < 720) return `בוקר טוב ${person.name}`
  if (minutes < 900) return `צהריים טובים ${person.name}`
  if (minutes < 1080) return `אחה״צ טובים ${person.name}`
  if (minutes < 1320) return `ערב טוב ${person.name}`
  return `לילה טוב ${person.name}`
}

export function remainingToday(events: FamilyEvent[], tasks: FamilyTask[], memberId: string, now = new Date()) {
  const date = localIsoDate(now)
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const remainingEvents = events.filter(event => event.date === date && event.time >= time && (event.participantIds.includes(memberId) || event.responsibleId === memberId))
    .sort((left, right) => left.time.localeCompare(right.time))
  const urgentTasks = tasks.filter(task => {
    if (task.done || task.ownerId !== memberId) return false
    const dueToday = task.due === date || task.due.startsWith(`${date}T`)
    const overdueAndUrgent = task.due < date && (task.priority === 'high' || task.priority === 'critical')
    return dueToday || overdueAndUrgent
  })
    .sort((left, right) => left.due.localeCompare(right.due) || left.title.localeCompare(right.title, 'he'))
  return { events: remainingEvents, tasks: urgentTasks }
}

export const localIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function startOfWeek(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  result.setDate(result.getDate() - result.getDay())
  return result
}

export function calendarDays(anchor: Date, range: CalendarRange): Date[] {
  if (range === 'day') return [new Date(anchor)]
  if (range === 'week') return Array.from({ length: 7 }, (_, index) => { const day = startOfWeek(anchor); day.setDate(day.getDate() + index); return day })
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  return Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(day.getDate() + index); return day })
}

export function visibleMemberIds(people: Person[], actorId: string, childMode: boolean, selectedIds = people.map(person => person.id)) {
  return childMode ? people.filter(person => person.id === actorId).map(person => person.id) : people.filter(person => selectedIds.includes(person.id)).map(person => person.id)
}

export function eventsForMembers(events: FamilyEvent[], memberIds: string[]) {
  return events.filter(event => memberIds.some(id => event.participantIds.includes(id) || event.responsibleId === id))
}
