import { randomUUID } from 'node:crypto'
import type { LiaReadContext } from '../../../src/liaReadContext.js'
import type { LiaActionProposal } from '../../../src/liaActionProposals.js'
import { findEventTimeConflicts } from './readTools.js'

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export function createActionProposal(name: string, args: unknown, context: LiaReadContext): LiaActionProposal {
  if (name !== 'propose_update_event_time') throw new Error('Unsupported proposal type')
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid proposal')
  const input = args as Record<string, unknown>
  if (Object.keys(input).some(key => !['targetId', 'time'].includes(key)) || Object.keys(input).length !== 2) throw new Error('Invalid proposal fields')
  if (typeof input.targetId !== 'string' || !input.targetId || typeof input.time !== 'string' || !timePattern.test(input.time)) throw new Error('Invalid proposal values')
  const event = context.events.find(item => item.id === input.targetId && item.familyId === context.family.id)
  if (!event) throw new Error('Unknown proposal target')
  if (event.time === input.time) throw new Error('Proposal does not change the event')
  const warnings = findEventTimeConflicts(context, event, input.time)
  return {
    id: randomUUID(), type: 'update_event_time', familyId: context.family.id, targetId: event.id,
    summary: `שינוי שעת ${event.title}`, eventTitle: event.title, eventDate: event.date,
    before: { time: event.time }, after: { time: input.time }, warnings, requiresConfirmation: true,
  }
}

