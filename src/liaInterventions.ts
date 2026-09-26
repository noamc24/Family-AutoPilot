import type { AppData, IntegrationSource } from './data'

export type LiaInterventionStatus = 'decisionRequired' | 'waiting' | 'owned' | 'inProgress' | 'completed' | 'noAction'
export type LiaActionKind = 'takeOwnership' | 'complete' | 'cannotDo' | 'acceptHandoff' | 'declineHandoff' | 'approve' | 'addToCalendar' | 'dismiss' | 'openDetails'
export type LiaInterventionAction = { id: string; kind: LiaActionKind; label: string; primary?: boolean }
export type LiaInterventionSource = { sourceId: IntegrationSource; mode: 'demo' | 'live' }
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
  relatedMemberIds: string[]
  createdAt: string
  updatedAt: string
  visibility: { audience: 'family' | 'members'; memberIds?: string[] }
  handoffRequestId?: string
  resolvedAt?: string
  resolvedBy?: string
  resolutionType?: 'responsibilityConfirmed' | 'responsibilityTransferred' | 'dismissed' | 'eventRemoved'
  resolutionSummary?: string
}

export const liaStatusLabels: Record<LiaInterventionStatus, string> = {
  decisionRequired: 'דורש החלטה', waiting: 'ממתין לתגובה', owned: 'נלקחה אחריות', inProgress: 'בטיפול', completed: 'הושלם', noAction: 'אין צורך בפעולה',
}

const now = () => new Date().toISOString()
const modeFor = (data: AppData, familyId: string, sourceId: IntegrationSource): 'demo' | 'live' =>
  data.families.find(family => family.id === familyId)?.people.flatMap(person => person.personalSettings?.integrations || []).find(item => item.sourceId === sourceId)?.mode || 'demo'

export function buildLiaInterventions(data: AppData, familyId: string): LiaIntervention[] {
  const family = data.families.find(item => item.id === familyId)
  if (!family) return []
  const timestamp = now()
  const child = family.people.find(person => person.age < 18)
  const adult = family.people.find(person => person.age >= 18)
  const stored = (data.liaInterventions || []).filter(item => item.familyId === familyId)
  const demo: LiaIntervention[] = familyId === 'Avrahami' ? [
    { id: 'lia-demo-whatsapp', familyId, type: 'message' as const, title: 'LIA זיהתה שינוי', detectedChange: `הפעילות של ${child?.name || 'בן המשפחה'} הוקדמה ל־17:00.`, whyItMatters: 'השינוי משפיע על שעת היציאה וההסעה.', recommendation: 'לאשר את השעה החדשה בתוכנית.', sources: [{ sourceId: 'whatsapp', mode: modeFor(data, familyId, 'whatsapp') }], actions: [], status: 'waiting', explanation: 'מתרחיש WhatsApp הדמו נגזר עדכון שעה. ההודעה המלאה אינה מוצגת למשפחה.', relatedMemberIds: child ? [child.id] : [], createdAt: timestamp, updatedAt: timestamp, visibility: { audience: 'family' } },
    { id: 'lia-demo-handled', familyId, type: 'calendar' as const, title: 'האירוע נוסף ליומן', detectedChange: 'עדכון משפחתי הפך לאירוע מסודר.', whyItMatters: 'האירוע זמין כעת בתוכנית המשפחתית.', recommendation: '', sources: [{ sourceId: 'calendar', mode: modeFor(data, familyId, 'calendar') }], actions: [], status: 'completed', statusDetail: adult ? `היומן של ${adult.name} עודכן` : undefined, explanation: 'הפרטים נבדקו והאירוע נשמר בלוח.', relatedMemberIds: adult ? [adult.id] : [], createdAt: timestamp, updatedAt: timestamp, visibility: { audience: 'family' } },
  ] : []
  return [...stored, ...demo.filter(item => !stored.some(saved => saved.id === item.id))]
}

export function transitionLiaIntervention(item: LiaIntervention, action: LiaActionKind, actorName = ''): LiaIntervention {
  const updatedAt = now()
  if (action === 'takeOwnership') return { ...item, status: 'inProgress', statusDetail: actorName ? `${actorName} לקח/ה אחריות` : 'נלקחה אחריות', updatedAt }
  if (action === 'cannotDo') return { ...item, status: 'waiting', statusDetail: 'ממתין לבן משפחה אחר', updatedAt }
  if (action === 'approve' || action === 'addToCalendar') return { ...item, status: 'completed', statusDetail: 'העדכון אושר ונסגר', actions: [], updatedAt }
  if (action === 'dismiss') return { ...item, status: 'noAction', statusDetail: 'הוחלט שאין צורך בפעולה', actions: [], updatedAt }
  return item
}
