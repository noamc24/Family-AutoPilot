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
function dateContext(context: LiaReadContext, date: string) {
  return { date, weekday: hebrewWeekday(date), isToday: date === context.today }
}

export function getFamilyMembers(context: LiaReadContext, args: Args) {
  assertKeys(args, [])
  return context.family.people.map(({ id, name, role }) => ({ id, name, role }))
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
    if (person.availability && !['available', 'home'].includes(person.availability)) reasons.push(person.availability === 'work' ? 'בעבודה' : person.availability === 'travel' ? 'בנסיעה' : 'לא זמין/ה')
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
  const event = context.events.find(item => eventId ? item.id === eventId : item.date === date && item.title.includes(title!))
  if (!event) return { ...dateContext(context, date), event: null, eligibleDrivers: [], message: 'No matching event found' }
  const data = appData(context)
  const eligible = new Set(eligibleDrivers(data, event).map(person => person.id))
  return { ...dateContext(context, event.date), event: { id: event.id, title: event.title, date: event.date, weekday: hebrewWeekday(event.date), time: event.time }, eligibleDrivers: context.family.people.filter(person => eligible.has(person.id)).map(person => ({ id: person.id, name: person.name })), excluded: context.family.people.filter(person => !eligible.has(person.id)).map(person => ({ name: person.name, reason: pickupIneligibility(person, event, data) })) }
}
