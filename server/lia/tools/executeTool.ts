import type { LiaReadContext } from '../../../src/liaReadContext.js'
import type { LiaReadToolName } from './definitions.js'
import { findAvailableDrivers, findEvents, getFamilyMembers, getMemberAvailability, getSchedule, getScheduleConflicts, getTasks } from './readTools.js'

const registry: Record<LiaReadToolName, (context: LiaReadContext, args: Record<string, unknown>) => unknown> = {
  get_family_members: getFamilyMembers,
  find_events: findEvents,
  get_schedule: getSchedule,
  get_member_availability: getMemberAvailability,
  get_tasks: getTasks,
  get_schedule_conflicts: getScheduleConflicts,
  find_available_drivers: findAvailableDrivers,
}

export function executeLiaReadTool(name: string, args: unknown, context: LiaReadContext): unknown {
  const execute = registry[name as LiaReadToolName]
  if (!execute) throw new Error('Unknown LIA tool')
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid tool arguments')
  return execute(context, args as Record<string, unknown>)
}
