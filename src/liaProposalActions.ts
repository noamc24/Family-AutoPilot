import { saveEventAndDependents } from './domain'
import { isTime } from './dateTime'
import type { AppData } from './data'
import type { LiaActionProposal } from './liaActionProposals'

type ProposalResult = { data: AppData; status: 'completed' | 'dismissed' | 'failed'; message: string; success: boolean }

const exactKeys = (value: object, keys: string[]) => {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

export function isValidLiaActionProposal(value: unknown): value is LiaActionProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proposal = value as Record<string, unknown>
  if (!exactKeys(proposal, ['id', 'type', 'familyId', 'targetId', 'summary', 'eventTitle', 'eventDate', 'before', 'after', 'warnings', 'requiresConfirmation'])) return false
  if (proposal.type !== 'update_event_time' || proposal.requiresConfirmation !== true) return false
  if (!['id', 'familyId', 'targetId', 'summary', 'eventTitle', 'eventDate'].every(key => typeof proposal[key] === 'string' && !!(proposal[key] as string).trim())) return false
  if (!Array.isArray(proposal.warnings) || proposal.warnings.some(item => typeof item !== 'string')) return false
  if (!proposal.before || typeof proposal.before !== 'object' || Array.isArray(proposal.before) || !exactKeys(proposal.before, ['time'])) return false
  if (!proposal.after || typeof proposal.after !== 'object' || Array.isArray(proposal.after) || !exactKeys(proposal.after, ['time'])) return false
  const before = proposal.before as { time?: unknown }
  const after = proposal.after as { time?: unknown }
  return typeof before.time === 'string' && isTime(before.time) && typeof after.time === 'string' && isTime(after.time) && before.time !== after.time && /^\d{4}-\d{2}-\d{2}$/.test(proposal.eventDate as string)
}

export function resolveLiaActionProposal(data: AppData, familyId: string, proposal: unknown, decision: 'approve' | 'reject'): ProposalResult {
  if (!isValidLiaActionProposal(proposal) || proposal.familyId !== familyId) return { data, status: 'failed', message: 'לא הצלחתי לאמת את השינוי, ולכן לא בוצע דבר.', success: false }
  if (decision === 'reject') return { data, status: 'dismissed', message: `בסדר, לא שיניתי את ${proposal.eventTitle}.`, success: false }
  const event = data.events.find(item => item.id === proposal.targetId && item.familyId === familyId)
  if (!event || event.title !== proposal.eventTitle || event.date !== proposal.eventDate || event.time !== proposal.before.time) {
    return { data, status: 'failed', message: 'האירוע השתנה או כבר לא קיים, ולכן לא ביצעתי את ההצעה. אפשר לבקש הצעה חדשה.', success: false }
  }
  const next = saveEventAndDependents(data, { ...event, time: proposal.after.time })
  return { data: next, status: 'completed', message: `${event.title} עודכן ל־${proposal.after.time}.`, success: true }
}

