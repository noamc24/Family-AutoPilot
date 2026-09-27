import type { FamilyEvent, FamilyUnit, WeeklyRoutine } from './data'
import { localIsoDate } from './uiModel'
import { routineDaysList } from './workflow'

export type RoutineOccurrence = {
  id: string
  kind: 'routine'
  date: string
  start: string
  end: string
  title: string
  personId: string
  personName: string
  color: string
  routine: WeeklyRoutine
}

export const timeMinutes = (value: string) => {
  const [hour = 0, minute = 0] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function timesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return timeMinutes(startA) < timeMinutes(endB) && timeMinutes(startB) < timeMinutes(endA)
}

export function routineIsOverridden(personId: string, date: string, routine: WeeklyRoutine, events: FamilyEvent[]) {
  return events.some(event => {
    if (!event.routineOverride || event.date !== date || ![...event.participantIds, event.responsibleId].includes(personId)) return false
    const eventEnd = event.endTime || `${String(Math.min(23, Number(event.time.slice(0, 2)) + 1)).padStart(2, '0')}:${event.time.slice(3, 5)}`
    return timesOverlap(routine.start, routine.end, event.time, eventEnd)
  })
}

export function deriveRoutineOccurrences(family: FamilyUnit, days: Date[], events: FamilyEvent[], memberIds = family.people.map(person => person.id)): RoutineOccurrence[] {
  const selected = new Set(memberIds)
  return days.flatMap(day => {
    const date = localIsoDate(day)
    return family.people.filter(person => selected.has(person.id)).flatMap(person => (person.routines || []).filter(routine => routine.start && routine.end && routineDaysList(routine).includes(day.getDay()) && !routineIsOverridden(person.id, date, routine, events)).map(routine => ({
      id: `routine:${person.id}:${routine.id}:${date}`,
      kind: 'routine' as const,
      date,
      start: routine.start,
      end: routine.end,
      title: routine.label || 'לו״ז קבוע',
      personId: person.id,
      personName: person.name,
      color: person.color,
      routine,
    })))
  }).sort((left, right) => `${left.date}${left.start}${left.personId}`.localeCompare(`${right.date}${right.start}${right.personId}`))
}

export function monthPriority(item: FamilyEvent | RoutineOccurrence) {
  if ('kind' in item) return 4
  if (item.needsAttention) return 0
  if (item.sourceSignalId) return 1
  if (item.requiresDriver) return 2
  return 3
}

export function visibleMonthItems(events: FamilyEvent[], routines: RoutineOccurrence[], date: string, limit = 3) {
  const items = [...events.filter(event => event.date === date), ...routines.filter(item => item.date === date)]
    .sort((left, right) => monthPriority(left) - monthPriority(right) || (('time' in left ? left.time : left.start).localeCompare('time' in right ? right.time : right.start)))
  return { visible: items.slice(0, limit), overflow: Math.max(0, items.length - limit), all: items }
}
