import { saveEventAndDependents } from './domain'
import { isIsoDate, isTime } from './dateTime'
import { uid, type AppData, type FamilyEvent, type FamilyTask } from './data'
import type { LiaActionProposal } from './liaActionProposals'

type ProposalResult = { data: AppData; status: 'completed' | 'dismissed' | 'failed'; message: string; success: boolean }

const exactKeys = (value: object, keys: string[]) => {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

export function isValidLiaActionProposal(value: unknown): value is LiaActionProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proposal = value as Record<string, unknown>
  if (proposal.requiresConfirmation !== true || !['id', 'familyId', 'summary'].every(key => typeof proposal[key] === 'string' && !!(proposal[key] as string).trim())) return false
  if (!Array.isArray(proposal.warnings) || proposal.warnings.some(item => typeof item !== 'string')) return false
  if (proposal.type === 'update_event_time') {
    if (!exactKeys(proposal, ['id', 'type', 'familyId', 'targetId', 'summary', 'eventTitle', 'eventDate', 'before', 'after', 'warnings', 'requiresConfirmation'])) return false
    if (!['targetId', 'eventTitle', 'eventDate'].every(key => typeof proposal[key] === 'string' && !!(proposal[key] as string).trim())) return false
    if (!proposal.before || typeof proposal.before !== 'object' || Array.isArray(proposal.before) || !exactKeys(proposal.before, ['time'])) return false
    if (!proposal.after || typeof proposal.after !== 'object' || Array.isArray(proposal.after) || !exactKeys(proposal.after, ['time'])) return false
    const before = proposal.before as { time?: unknown }, after = proposal.after as { time?: unknown }
    return typeof before.time === 'string' && isTime(before.time) && typeof after.time === 'string' && isTime(after.time) && before.time !== after.time && isIsoDate(proposal.eventDate as string)
  }
  if (proposal.type === 'create_event') {
    if (!exactKeys(proposal, ['id', 'type', 'familyId', 'summary', 'title', 'date', 'weekday', 'time', 'endTime', 'participant', 'warnings', 'requiresConfirmation'])) return false
    if (!['title', 'date', 'weekday', 'time'].every(key => typeof proposal[key] === 'string' && !!(proposal[key] as string).trim()) || !isIsoDate(proposal.date as string) || !isTime(proposal.time as string)) return false
    const eventTime = proposal.time as string
    if (proposal.endTime !== null && (typeof proposal.endTime !== 'string' || !isTime(proposal.endTime) || proposal.endTime <= eventTime)) return false
    return !!proposal.participant && typeof proposal.participant === 'object' && !Array.isArray(proposal.participant) && exactKeys(proposal.participant, ['id', 'name']) && Object.values(proposal.participant).every(item => typeof item === 'string' && !!item.trim())
  }
  if (proposal.type === 'create_task') {
    if (!exactKeys(proposal, ['id', 'type', 'familyId', 'summary', 'title', 'due', 'weekday', 'assignee', 'warnings', 'requiresConfirmation'])) return false
    if (!['title', 'due', 'weekday'].every(key => typeof proposal[key] === 'string' && !!(proposal[key] as string).trim()) || !isIsoDate(proposal.due as string)) return false
    return !!proposal.assignee && typeof proposal.assignee === 'object' && !Array.isArray(proposal.assignee) && exactKeys(proposal.assignee, ['id', 'name']) && Object.values(proposal.assignee).every(item => typeof item === 'string' && !!item.trim())
  }
  return false
}

export function resolveLiaActionProposal(data: AppData, familyId: string, proposal: unknown, decision: 'approve' | 'reject', actorId = ''): ProposalResult {
  if (!isValidLiaActionProposal(proposal) || proposal.familyId !== familyId) return { data, status: 'failed', message: 'לא הצלחתי לאמת את השינוי, ולכן לא בוצע דבר.', success: false }
  if (decision === 'reject') return { data, status: 'dismissed', message: proposal.type === 'update_event_time' ? `בסדר, לא שיניתי את ${proposal.eventTitle}.` : proposal.type === 'create_event' ? `בסדר, לא יצרתי את ${proposal.title}.` : `בסדר, לא יצרתי את המשימה ${proposal.title}.`, success: false }
  if (proposal.type === 'update_event_time') {
    const event = data.events.find(item => item.id === proposal.targetId && item.familyId === familyId)
    if (!event || event.title !== proposal.eventTitle || event.date !== proposal.eventDate || event.time !== proposal.before.time) return { data, status: 'failed', message: 'האירוע השתנה או כבר לא קיים, ולכן לא ביצעתי את ההצעה. אפשר לבקש הצעה חדשה.', success: false }
    const next = saveEventAndDependents(data, { ...event, time: proposal.after.time })
    return { data: next, status: 'completed', message: `${event.title} עודכן ל־${proposal.after.time}.`, success: true }
  }
  const family = data.families.find(item => item.id === familyId)
  if (proposal.type === 'create_event') {
    const participant = family?.people.find(item => item.id === proposal.participant.id && item.name === proposal.participant.name)
    if (!participant) return { data, status: 'failed', message: 'בן המשפחה כבר לא זמין להצעה הזו, ולכן לא יצרתי את האירוע.', success: false }
    const event: FamilyEvent = { id: uid(), familyId, title: proposal.title, date: proposal.date, time: proposal.time, endTime: proposal.endTime || undefined, icon: '📅', participantIds: [participant.id], responsibleId: '', details: '', createdById: actorId || undefined }
    const saved = saveEventAndDependents(data, event)
    const next = { ...saved, activity: [{ id: uid(), familyId, text: `נוסף אירוע: ${event.title}`, personIds: [participant.id], eventId: event.id, createdAt: new Date().toISOString() }, ...saved.activity] }
    return { data: next, status: 'completed', message: `${event.title} נוסף ליומן ל־${proposal.time}.`, success: true }
  }
  const assignee = family?.people.find(item => item.id === proposal.assignee.id && item.name === proposal.assignee.name)
  if (!assignee) return { data, status: 'failed', message: 'האחראי למשימה כבר לא זמין להצעה הזו, ולכן לא יצרתי את המשימה.', success: false }
  const task: FamilyTask = { id: uid(), familyId, title: proposal.title, ownerId: assignee.id, due: proposal.due, done: false }
  return { data: { ...data, tasks: [...data.tasks, task] }, status: 'completed', message: `המשימה ${task.title} נוספה ל${assignee.name}.`, success: true }
}

