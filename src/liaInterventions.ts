import type { AppData, IntegrationSource } from './data'

export type LiaInterventionStatus = 'decisionRequired' | 'waiting' | 'owned' | 'inProgress' | 'completed' | 'noAction'
export type LiaActionKind = 'takeOwnership' | 'complete' | 'cannotDo' | 'acceptHandoff' | 'declineHandoff' | 'approve' | 'addToCalendar' | 'createTask' | 'dismiss' | 'reassign' | 'openDetails'
export type LiaInterventionAction = { id: string; kind: LiaActionKind; label: string; primary?: boolean }
export type LiaInterventionSource = { sourceId: IntegrationSource; mode: 'demo' | 'live'; ownerMemberId?: string }
export type LiaIntervention = {
  id: string
  familyId: string
  type: 'traffic' | 'message' | 'calendar' | 'coordination'
  title: string
  detectedChange: string
  whyItMatters: string
  recommendation: string
  sources: LiaInterventionSource[]
  actions: LiaInterventionAction[]
  status: LiaInterventionStatus
  statusDetail?: string
  explanation: string
  relatedEventId?: string
  relatedTaskId?: string
  signalId?: string
  relatedMemberIds: string[]
  createdAt: string
  updatedAt: string
  visibility: { audience: 'family' | 'members'; memberIds?: string[] }
  handoffRequestId?: string
  resolvedAt?: string
  resolvedBy?: string
  resolutionType?: 'responsibilityConfirmed' | 'responsibilityTransferred' | 'calendarUpdated' | 'taskCreated' | 'dismissed' | 'eventRemoved'
  resolutionSummary?: string
}

export const liaStatusLabels: Record<LiaInterventionStatus, string> = {
  decisionRequired: 'דורש החלטה', waiting: 'ממתין לתגובה', owned: 'נלקחה אחריות', inProgress: 'בטיפול', completed: 'הושלם', noAction: 'אין צורך בפעולה',
}

const now = () => new Date().toISOString()
const eventChangeActions: LiaInterventionAction[] = [
  { id: 'calendar', kind: 'addToCalendar', label: 'אישור ועדכון', primary: true },
  { id: 'reject', kind: 'dismiss', label: 'דחייה' },
]

/** Restores the decision contract for persisted event-change items created by older builds. */
export function withRequiredDecisionActions(data: AppData, item: LiaIntervention): LiaIntervention {
  if (!['decisionRequired', 'waiting'].includes(item.status) || item.actions.length > 0 || !item.signalId) return item
  const signal = (data.externalSignals || []).find(entry => entry.id === item.signalId)
  if (signal?.status === 'handled' || signal?.signalType !== 'eventUpdate' || !signal.eventCandidate) return item
  return { ...item, actions: eventChangeActions.map(action => ({ ...action })) }
}

export function buildLiaInterventions(data: AppData, familyId: string): LiaIntervention[] {
  const family = data.families.find(item => item.id === familyId)
  if (!family) return []
  return (data.liaInterventions || [])
    .filter(item => item.familyId === familyId)
    .map(item => withRequiredDecisionActions(data, item))
}

export function transitionLiaIntervention(item: LiaIntervention, action: LiaActionKind, actorName = ''): LiaIntervention {
  const updatedAt = now()
  if (action === 'takeOwnership') return { ...item, status: 'inProgress', statusDetail: actorName ? `${actorName} לקח/ה אחריות` : 'נלקחה אחריות', updatedAt }
  if (action === 'cannotDo') return { ...item, status: 'waiting', statusDetail: 'ממתין לבן משפחה אחר', updatedAt }
  if (action === 'approve' || action === 'addToCalendar') return { ...item, status: 'completed', statusDetail: 'העדכון אושר ונסגר', actions: [], updatedAt }
  if (action === 'dismiss') return { ...item, status: 'noAction', statusDetail: 'הוחלט שאין צורך בפעולה', actions: [], updatedAt }
  return item
}
