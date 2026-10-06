import { randomUUID } from 'node:crypto'
import type { LiaReadContext } from '../../../src/liaReadContext.js'
import type { LiaActionProposal } from '../../../src/liaActionProposals.js'
import { hebrewWeekday, isIsoDate } from '../../../src/dateTime.js'
import type { FamilyEvent } from '../../../src/data.js'
import { findEventTimeConflicts } from './readTools.js'

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
const exactKeys = (input: Record<string, unknown>, allowed: string[], required: string[]) => !Object.keys(input).some(key => !allowed.includes(key)) && required.every(key => Object.hasOwn(input, key))
const cleanTitle = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120 ? value.trim() : undefined
const dateValue = (value: unknown, today: string) => {
  if (value === 'today') return today
  if (value === 'tomorrow') {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)
    return date.toISOString().slice(0, 10)
  }
  return typeof value === 'string' && isIsoDate(value) ? value : undefined
}
const memberValue = (value: unknown, context: LiaReadContext) => typeof value === 'string' ? context.family.people.find(person => person.id === value || person.name === value) : undefined

export function createActionProposal(name: string, args: unknown, context: LiaReadContext): LiaActionProposal {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid proposal')
  const input = args as Record<string, unknown>
  if (name === 'propose_update_event_time') {
    if (!exactKeys(input, ['targetId', 'time'], ['targetId', 'time'])) throw new Error('Invalid proposal fields')
    if (typeof input.targetId !== 'string' || !input.targetId || typeof input.time !== 'string' || !timePattern.test(input.time)) throw new Error('Invalid proposal values')
    const event = context.events.find(item => item.id === input.targetId && item.familyId === context.family.id)
    if (!event) throw new Error('Unknown proposal target')
    if (event.time === input.time) throw new Error('Proposal does not change the event')
    const warnings = findEventTimeConflicts(context, event, input.time)
    return { id: randomUUID(), type: 'update_event_time', familyId: context.family.id, targetId: event.id, summary: `שינוי שעת ${event.title}`, eventTitle: event.title, eventDate: event.date, before: { time: event.time }, after: { time: input.time }, warnings, requiresConfirmation: true }
  }
  if (name === 'propose_create_event') {
    if (!exactKeys(input, ['title', 'date', 'time', 'endTime', 'member'], ['title', 'date', 'time', 'member'])) throw new Error('Invalid proposal fields')
    const title = cleanTitle(input.title), date = dateValue(input.date, context.today), member = memberValue(input.member, context)
    const time = typeof input.time === 'string' && timePattern.test(input.time) ? input.time : undefined
    const endTime = input.endTime === undefined ? null : typeof input.endTime === 'string' && timePattern.test(input.endTime) ? input.endTime : undefined
    if (!title || !date || !member || !time || endTime === undefined || endTime && endTime <= time) throw new Error('Invalid proposal values')
    const candidate: FamilyEvent = { id: `proposal:${randomUUID()}`, familyId: context.family.id, title, date, time, endTime: endTime || undefined, icon: '📅', participantIds: [member.id], responsibleId: '', details: '' }
    return { id: randomUUID(), type: 'create_event', familyId: context.family.id, summary: 'אירוע חדש', title, date, weekday: hebrewWeekday(date), time, endTime, participant: { id: member.id, name: member.name }, warnings: findEventTimeConflicts(context, candidate, time), requiresConfirmation: true }
  }
  if (name === 'propose_create_task') {
    if (!exactKeys(input, ['title', 'due', 'member'], ['title', 'due', 'member'])) throw new Error('Invalid proposal fields')
    const title = cleanTitle(input.title), due = dateValue(input.due, context.today), member = memberValue(input.member, context)
    if (!title || !due || !member) throw new Error('Invalid proposal values')
    return { id: randomUUID(), type: 'create_task', familyId: context.family.id, summary: 'משימה חדשה', title, due, weekday: hebrewWeekday(due), assignee: { id: member.id, name: member.name }, warnings: [], requiresConfirmation: true }
  }
  throw new Error('Unsupported proposal type')
}

