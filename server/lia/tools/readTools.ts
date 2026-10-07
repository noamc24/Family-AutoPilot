import { eligibleDrivers } from '../../../src/coordination.js'
import { pickupIneligibility } from '../../../src/domain.js'
import { routineAt } from '../../../src/workflow.js'
import { hebrewWeekday } from '../../../src/dateTime.js'
import type { FamilyEvent, Person } from '../../../src/data.js'
import type { LiaReadContext } from '../../../src/liaReadContext.js'

type Args = Record<string, unknown>
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const minutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m }
const eventEnd = (event: FamilyEvent) => event.endTime || `${String(Math.min(23, Number(event.time.slice(0, 2)) + 1)).padStart(2, '0')}:${event.time.slice(3)}`
const overlaps = (a: string, b: string, c: string, d: string) => minutes(a) < minutes(d) && minutes(c) < minutes(b)
const shiftedEnd = (event: FamilyEvent, time: string) => {
  const duration = Math.max(1, minutes(eventEnd(event)) - minutes(event.time))
  const total = Math.min(23 * 60 + 59, minutes(time) + duration)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function textArg(args: Args, key: string, pattern?: RegExp) {
  const value = args[key]
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || !value.trim() || pattern && !pattern.test(value)) throw new Error(`Invalid ${key}`)
  return value.trim()
}
function assertKeys(args: Args, allowed: string[]) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Invalid tool arguments')
}
function memberFor(context: LiaReadContext, value?: string): Person | undefined {
  if (!value) return undefined
  const member = context.family.people.find(item => item.id === value || item.name === value)
  if (!member) throw new Error('Unknown family member')
  return member
}
function appData(context: LiaReadContext) {
  return { families: [context.family], events: context.events, tasks: context.tasks, transportationRequests: context.transportationRequests, activity: [], integrationLogs: [], calendarMirrors: [] }
}

export function findEventTimeConflicts(context: LiaReadContext, target: FamilyEvent, time: string): string[] {
  const endTime = shiftedEnd(target, time)
  const involved = new Set([...target.participantIds, target.responsibleId].filter(Boolean))
  const warnings: string[] = []
  for (const event of context.events) {
    if (event.id === target.id || event.date !== target.date || !overlaps(time, endTime, event.time, eventEnd(event))) continue
    const shared = context.family.people.filter(person => involved.has(person.id) && (event.participantIds.includes(person.id) || event.responsibleId === person.id))
    if (shared.length) warnings.push(`${shared.map(person => person.name).join(', ')}: ${event.title}`)
  }
  for (const person of context.family.people.filter(item => involved.has(item.id))) {
    const routine = routineAt(person, target.date, time, endTime)
    if (routine) warnings.push(`${person.name}: ${routine.label}`)
  }
  return [...new Set(warnings)]
}
function dateContext(context: LiaReadContext, date: string) {
  return { date, weekday: hebrewWeekday(date), isToday: date === context.today }
}

export function getFamilyMembers(context: LiaReadContext, args: Args) {
  assertKeys(args, [])
  return context.family.people.map(({ id, name, role }) => ({ id, name, role }))
}
export function findEvents(context: LiaReadContext, args: Args) {
  assertKeys(args, ['query', 'member'])
  const query = textArg(args, 'query')?.toLocaleLowerCase('he-IL')
  const member = memberFor(context, textArg(args, 'member'))
  if (!query && !member) throw new Error('query or member is required')
  const events = context.events
    .filter(event => event.date >= context.today && (!query || event.title.toLocaleLowerCase('he-IL').includes(query)) && (!member || event.participantIds.includes(member.id) || event.responsibleId === member.id))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .map(event => ({ id: event.id, title: event.title, date: event.date, weekday: hebrewWeekday(event.date), time: event.time, endTime: event.endTime, participants: event.participantIds.map(id => context.family.people.find(person => person.id === id)?.name).filter(Boolean) }))
  return { count: events.length, events }
}
export function getSchedule(context: LiaReadContext, args: Args) {
  assertKeys(args, ['date', 'member'])
  const date = textArg(args, 'date', datePattern) || context.today
  const member = memberFor(context, textArg(args, 'member'))
  const events = context.events.filter(event => event.date === date && (!member || event.participantIds.includes(member.id) || event.responsibleId === member.id)).map(event => ({ id: event.id, title: event.title, date: event.date, time: event.time, endTime: event.endTime, participants: event.participantIds.map(id => context.family.people.find(person => person.id === id)?.name).filter(Boolean), responsible: context.family.people.find(person => person.id === event.responsibleId)?.name, requiresDriver: !!event.requiresDriver }))
  const members = member ? [member] : context.family.people
  const routines = members.flatMap(person => (person.routines || []).filter(routine => (routine.days || (routine.day === undefined ? [] : [routine.day])).includes(new Date(`${date}T12:00:00`).getDay())).map(routine => ({ member: person.name, label: routine.label, start: routine.start, end: routine.end })))
  return { ...dateContext(context, date), events, routines }
}
export function getMemberAvailability(context: LiaReadContext, args: Args) {
  assertKeys(args, ['member', 'date', 'time', 'endTime'])
  const date = textArg(args, 'date', datePattern) || context.today
  const time = textArg(args, 'time', timePattern)
  const endTime = textArg(args, 'endTime', timePattern) || (time ? `${String(Math.min(23, Number(time.slice(0, 2)) + 1)).padStart(2, '0')}:${time.slice(3)}` : undefined)
  const selected = memberFor(context, textArg(args, 'member'))
  const members = (selected ? [selected] : context.family.people).map(person => {
    const reasons: string[] = []
    if (person.availability && !['available', 'home'].includes(person.availability)) reasons.push(person.availability === 'work' ? 'בעבודה' : person.availability === 'travel' ? 'בנסיעה' : 'ללא זמינות')
    if (time && endTime) {
      const routine = routineAt(person, date, time, endTime)
      if (routine) reasons.push(`לו״ז קבוע: ${routine.label}`)
      if (context.events.some(event => event.date === date && (event.participantIds.includes(person.id) || event.responsibleId === person.id) && overlaps(time, endTime, event.time, eventEnd(event)))) reasons.push('אירוע אחר באותה שעה')
    }
    return { id: person.id, name: person.name, available: reasons.length === 0, reasons }
  })
  return { ...dateContext(context, date), time, endTime, members }
}
export function getTasks(context: LiaReadContext, args: Args) {
  assertKeys(args, ['member', 'date', 'allDates', 'status'])
  const member = memberFor(context, textArg(args, 'member'))
  if (args.allDates !== undefined && typeof args.allDates !== 'boolean') throw new Error('Invalid allDates')
  const date = args.allDates ? undefined : textArg(args, 'date', datePattern) || context.today
  const status = textArg(args, 'status') || 'open'
  if (!['open', 'done', 'all'].includes(status)) throw new Error('Invalid status')
  const tasks = context.tasks.filter(task => (!member || task.ownerId === member.id) && (!date || task.due === date) && (status === 'all' || task.done === (status === 'done'))).map(task => ({ id: task.id, title: task.title, due: task.due, done: task.done, owner: context.family.people.find(person => person.id === task.ownerId)?.name, priority: task.priority }))
  return date ? { ...dateContext(context, date), tasks } : { allDates: true, tasks }
}
export function getScheduleConflicts(context: LiaReadContext, args: Args) {
  assertKeys(args, ['date', 'member'])
  const date = textArg(args, 'date', datePattern) || context.today
  const member = memberFor(context, textArg(args, 'member'))
  const events = context.events.filter(event => event.date === date && (!member || event.participantIds.includes(member.id) || event.responsibleId === member.id))
  const conflicts: unknown[] = []
  for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) {
    const shared = context.family.people.filter(person => (events[i].participantIds.includes(person.id) || events[i].responsibleId === person.id) && (events[j].participantIds.includes(person.id) || events[j].responsibleId === person.id))
    if (shared.length && overlaps(events[i].time, eventEnd(events[i]), events[j].time, eventEnd(events[j]))) conflicts.push({ events: [events[i].title, events[j].title], members: shared.map(person => person.name) })
  }
  return { ...dateContext(context, date), conflicts }
}
export function findAvailableDrivers(context: LiaReadContext, args: Args) {
  assertKeys(args, ['eventId', 'eventTitle', 'date'])
  const eventId = textArg(args, 'eventId')
  const title = textArg(args, 'eventTitle')
  const date = textArg(args, 'date', datePattern) || context.today
  if (!eventId && !title) throw new Error('eventId or eventTitle is required')
  const matches = context.events.filter(item => eventId ? item.id === eventId : item.date === date && item.title.includes(title!))
  if (!eventId && matches.length > 1) return { ...dateContext(context, date), event: null, ambiguous: true, matches: matches.map(item => ({ id: item.id, title: item.title, date: item.date, weekday: hebrewWeekday(item.date), time: item.time })), eligibleDrivers: [], message: 'Multiple matching events found; ask the user which event they mean' }
  const event = matches[0]
  if (!event) return { ...dateContext(context, date), event: null, eligibleDrivers: [], message: 'No matching event found' }
  const data = appData(context)
  const eligible = new Set(eligibleDrivers(data, event).map(person => person.id))
  const request = context.transportationRequests.find(item => item.eventId === event.id)
  const passenger = request && context.family.people.find(person => person.id === request.passengerId)
  const currentDriver = request && context.family.people.find(person => person.id === request.selectedDriverId)
  return { ...dateContext(context, event.date), event: { id: event.id, title: event.title, date: event.date, weekday: hebrewWeekday(event.date), time: event.time }, request: request ? { id: request.id, status: request.status, passenger: passenger ? { id: passenger.id, name: passenger.name } : null, currentDriver: currentDriver ? { id: currentDriver.id, name: currentDriver.name } : null } : null, eligibleDrivers: context.family.people.filter(person => eligible.has(person.id)).map(person => ({ id: person.id, name: person.name })), excluded: context.family.people.filter(person => !eligible.has(person.id)).map(person => ({ name: person.name, reason: pickupIneligibility(person, event, data) })) }
}
