import { localDate, type AppData, type IntegrationSource } from './data'

export type LiaInterventionStatus = 'decisionRequired' | 'waiting' | 'owned' | 'inProgress' | 'completed' | 'noAction'
export type LiaActionKind = 'takeOwnership' | 'cannotDo' | 'approve' | 'addToCalendar' | 'dismiss' | 'openDetails'
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
  const trafficEvent = data.events.find(event => event.familyId === familyId && event.id === 'football') || data.events.find(event => event.familyId === familyId && event.requiresDriver && event.date >= localDate())
  const child = family.people.find(person => person.age < 18)
  const adult = family.people.find(person => person.age >= 18)
  const demo: LiaIntervention[] = familyId === 'Avrahami' ? [
    ...(trafficEvent ? [{
      id: 'lia-demo-traffic', familyId, type: 'traffic' as const, title: 'LIA זיהתה עומס בדרך', detectedChange: `זמן הנסיעה ל${trafficEvent.title} התארך.`, whyItMatters: 'יציאה בשעה הרגילה עלולה לגרום לאיחור.', recommendation: 'מומלץ לצאת 15 דקות מוקדם יותר.', sources: [{ sourceId: 'waze' as const, mode: modeFor(data, familyId, 'waze') }, { sourceId: 'calendar' as const, mode: modeFor(data, familyId, 'calendar') }], actions: [{ id: 'take', kind: 'takeOwnership' as const, label: 'אני מטפל/ת', primary: true }, { id: 'cannot', kind: 'cannotDo' as const, label: 'לא יכול/ה' }], status: 'decisionRequired' as const, explanation: `האימון מופיע בלוח בשעה ${trafficEvent.time}, וזמן הנסיעה התארך עקב עומס בדרך.`, relatedEventId: trafficEvent.id, relatedMemberIds: [...new Set([trafficEvent.responsibleId, ...trafficEvent.participantIds].filter(Boolean))], createdAt: timestamp, updatedAt: timestamp, visibility: { audience: 'members' as const, memberIds: [...new Set([trafficEvent.responsibleId, ...trafficEvent.participantIds].filter(Boolean))] }
    }] : []),
    { id: 'lia-demo-whatsapp', familyId, type: 'message' as const, title: 'LIA זיהתה שינוי', detectedChange: `הפעילות של ${child?.name || 'בן המשפחה'} הוקדמה ל־17:00.`, whyItMatters: 'השינוי משפיע על שעת היציאה וההסעה.', recommendation: 'לאשר את השעה החדשה בתוכנית.', sources: [{ sourceId: 'whatsapp', mode: modeFor(data, familyId, 'whatsapp') }], actions: [{ id: 'approve', kind: 'approve', label: 'אישור', primary: true }, { id: 'dismiss', kind: 'dismiss', label: 'התעלם' }], status: 'waiting', explanation: 'מתרחיש WhatsApp הדמו נגזר עדכון שעה. ההודעה המלאה אינה מוצגת למשפחה.', relatedMemberIds: child ? [child.id] : [], createdAt: timestamp, updatedAt: timestamp, visibility: { audience: 'family' } },
    { id: 'lia-demo-handled', familyId, type: 'calendar' as const, title: 'האירוע נוסף ליומן', detectedChange: 'עדכון משפחתי הפך לאירוע מסודר.', whyItMatters: 'האירוע זמין כעת בתוכנית המשפחתית.', recommendation: '', sources: [{ sourceId: 'calendar', mode: modeFor(data, familyId, 'calendar') }], actions: [], status: 'completed', statusDetail: adult ? `היומן של ${adult.name} עודכן` : undefined, explanation: 'הפרטים נבדקו והאירוע נשמר בלוח.', relatedMemberIds: adult ? [adult.id] : [], createdAt: timestamp, updatedAt: timestamp, visibility: { audience: 'family' } },
  ] : []
  return demo
}

export function transitionLiaIntervention(item: LiaIntervention, action: LiaActionKind, actorName = ''): LiaIntervention {
  const updatedAt = now()
  if (action === 'takeOwnership') return { ...item, status: 'inProgress', statusDetail: actorName ? `${actorName} לקח/ה אחריות` : 'נלקחה אחריות', updatedAt }
  if (action === 'cannotDo') return { ...item, status: 'waiting', statusDetail: 'ממתין לבן משפחה אחר', updatedAt }
  if (action === 'approve' || action === 'addToCalendar') return { ...item, status: 'completed', statusDetail: 'העדכון אושר ונסגר', actions: [], updatedAt }
  if (action === 'dismiss') return { ...item, status: 'noAction', statusDetail: 'הוחלט שאין צורך בפעולה', actions: [], updatedAt }
  return item
}
