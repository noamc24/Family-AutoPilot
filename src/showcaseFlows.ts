import { localDate, type Activity, type AppData, type FamilyEvent, type FamilyTask, type IntegrationSource } from './data'
import type { LiaActionKind, LiaIntervention } from './liaInterventions'
import { memberAllowsSource } from './trafficSignals'

export type ExternalSignal = {
  id: string
  familyId: string
  sourceId: 'whatsapp' | 'email' | 'school'
  ownerMemberId: string
  receivedAt: string
  privatePayload: string
  familyInsight: string
  signalType: 'eventUpdate' | 'task'
  status: 'unread' | 'detected' | 'handled'
  eventCandidate?: { targetEventId: string; title: string; date: string; time: string; originalTime: string; relatedMemberId: string }
  taskCandidate?: { title: string; dueDate: string; relatedMemberId: string; priority: 'normal' | 'high' }
  resultEventId?: string
  resultTaskId?: string
}

export type ShowcaseKind = 'whatsapp-calendar' | 'school-action'

const interventionId = (signalId: string) => `lia-showcase:${signalId}`
const activityId = (signalId: string, stage: string) => `activity:showcase:${signalId}:${stage}`

function integrationMode(data: AppData, signal: ExternalSignal) {
  return data.families.find(family => family.id === signal.familyId)?.people.find(person => person.id === signal.ownerMemberId)?.personalSettings?.integrations.find(item => item.sourceId === signal.sourceId)?.mode || 'demo'
}

function addActivityOnce(data: AppData, signal: ExternalSignal, stage: string, text: string, personIds: string[]): AppData {
  const id = activityId(signal.id, stage)
  if (data.activity.some(item => item.id === id)) return data
  const activity: Activity = { id, familyId: signal.familyId, text, personIds: [...new Set(personIds)], createdAt: new Date().toISOString(), source: signal.sourceId }
  return { ...data, activity: [activity, ...data.activity] }
}

export function createDemoShowcaseSignal(data: AppData, familyId: string, ownerMemberId: string, kind: ShowcaseKind): ExternalSignal | null {
  const family = data.families.find(item => item.id === familyId)
  const owner = family?.people.find(person => person.id === ownerMemberId)
  if (!family || !owner) return null
  const child = family.people.find(person => person.id === 'Itamar') || family.people.find(person => person.age < 18)
  if (!child) return null
  if (kind === 'whatsapp-calendar') {
    const event = data.events.find(item => item.familyId === familyId && item.id === 'football') || data.events.find(item => item.familyId === familyId && item.participantIds.includes(child.id))
    if (!event) return null
    return { id: `showcase-whatsapp:${familyId}`, familyId, sourceId: 'whatsapp', ownerMemberId, receivedAt: new Date().toISOString(), privatePayload: `שיחת WhatsApp פרטית: "האימון של ${child.name} הוקדם היום ל-16:30 במקום ${event.time}"`, familyInsight: `LIA זיהתה שהאימון של ${child.name} הוקדם ל־16:30.`, signalType: 'eventUpdate', status: 'unread', eventCandidate: { targetEventId: event.id, title: event.title, date: event.date, time: '16:30', originalTime: event.time, relatedMemberId: child.id } }
  }
  return { id: `showcase-school:${familyId}`, familyId, sourceId: 'school', ownerMemberId, receivedAt: new Date().toISOString(), privatePayload: 'הודעת בית הספר המלאה: נא להעביר אישור הורים חתום לטיול עד יום שלישי. פרטי הכיתה והצוות נשארים פרטיים.', familyInsight: 'בית הספר ביקש לשלוח אישור הורים לטיול עד יום שלישי.', signalType: 'task', status: 'unread', taskCandidate: { title: 'לשלוח אישור הורים לטיול', dueDate: localDate(3), relatedMemberId: child.id, priority: 'high' } }
}

export function receiveShowcaseSignal(data: AppData, signal: ExternalSignal): AppData {
  if ((data.externalSignals || []).some(item => item.id === signal.id) || (data.liaInterventions || []).some(item => item.signalId === signal.id)) return data
  if (!memberAllowsSource(data, signal.familyId, signal.ownerMemberId, signal.sourceId)) return data
  const timestamp = new Date().toISOString()
  const taskSignal = signal.signalType === 'task'
  const item: LiaIntervention = {
    id: interventionId(signal.id), familyId: signal.familyId, signalId: signal.id, type: 'message',
    title: taskSignal ? 'LIA זיהתה משהו שדורש פעולה' : 'LIA זיהתה שינוי באירוע',
    detectedChange: signal.familyInsight,
    whyItMatters: taskSignal ? 'יש פעולה עם מועד אחרון שכדאי להכניס לתוכנית.' : 'השעה החדשה משפיעה על התוכנית המשפחתית.',
    recommendation: taskSignal ? `ליצור משימה: ${signal.taskCandidate?.title}?` : 'לעדכן את האירוע הקיים ביומן.',
    sources: [{ sourceId: signal.sourceId, mode: integrationMode(data, signal), ownerMemberId: signal.ownerMemberId }],
    actions: taskSignal ? [{ id: 'create-task', kind: 'createTask', label: 'צור משימה', primary: true }, { id: 'not-now', kind: 'dismiss', label: 'לא עכשיו' }] : [{ id: 'calendar', kind: 'addToCalendar', label: 'עדכן ביומן', primary: true }, { id: 'not-now', kind: 'dismiss', label: 'לא עכשיו' }],
    status: 'decisionRequired',
    explanation: taskSignal ? 'ההודעה כוללת פעולה עם מועד אחרון ולכן LIA הציעה להפוך אותה למשימה.' : 'ההודעה זוהתה כשינוי בשעת חוג שכבר מופיע בלוח המשפחתי.',
    relatedMemberIds: [signal.ownerMemberId, taskSignal ? signal.taskCandidate!.relatedMemberId : signal.eventCandidate!.relatedMemberId],
    relatedEventId: signal.eventCandidate?.targetEventId,
    createdAt: timestamp, updatedAt: timestamp, visibility: { audience: 'family' },
  }
  const nextSignal = { ...signal, status: 'detected' as const }
  const next = { ...data, externalSignals: [...(data.externalSignals || []), nextSignal], liaInterventions: [item, ...(data.liaInterventions || [])] }
  return addActivityOnce(next, signal, 'detected', taskSignal ? 'LIA זיהתה עדכון מבית הספר שדורש פעולה.' : 'LIA זיהתה שינוי בשעת האימון.', item.relatedMemberIds)
}

export function triggerShowcase(data: AppData, familyId: string, ownerMemberId: string, kind: ShowcaseKind): { data: AppData; created: boolean; message: string } {
  const signal = createDemoShowcaseSignal(data, familyId, ownerMemberId, kind)
  if (!signal) return { data, created: false, message: 'לא נמצא מידע מתאים לתרחיש הדמו.' }
  const next = receiveShowcaseSignal(data, signal)
  if (next === data) return { data, created: false, message: 'המקור אינו מחובר ומאושר ל־LIA, או שהתרחיש כבר הגיע.' }
  return { data: next, created: true, message: 'LIA זיהתה עדכון חדש והוסיפה אותו למסך הבית.' }
}

export function applyShowcaseAction(data: AppData, itemId: string, action: LiaActionKind, actorId: string): AppData {
  const item = (data.liaInterventions || []).find(entry => entry.id === itemId)
  const signal = (data.externalSignals || []).find(entry => entry.id === item?.signalId)
  if (!item || !signal || item.status === 'completed') return data
  if (action === 'dismiss') return { ...data, liaInterventions: (data.liaInterventions || []).map(entry => entry.id === itemId ? { ...entry, statusDetail: 'נשמר להחלטה מאוחרת', updatedAt: new Date().toISOString() } : entry) }
  const timestamp = new Date().toISOString()
  if (action === 'addToCalendar' && signal.eventCandidate) {
    const candidate = signal.eventCandidate
    const existing = data.events.find(event => event.id === candidate.targetEventId)
    if (!existing) return data
    const updatedEvent: FamilyEvent = { ...existing, time: candidate.time, sourceNote: 'עודכן מתוך תובנה מ־WhatsApp', sourceSignalId: signal.id }
    let next: AppData = {
      ...data,
      events: data.events.map(event => event.id === existing.id ? updatedEvent : event),
      externalSignals: (data.externalSignals || []).map(entry => entry.id === signal.id ? { ...entry, status: 'handled', resultEventId: existing.id } : entry),
      liaInterventions: (data.liaInterventions || []).map(entry => entry.id === itemId ? { ...entry, status: 'completed', actions: [], relatedEventId: existing.id, resolvedAt: timestamp, resolvedBy: actorId, resolutionType: 'calendarUpdated', resolutionSummary: `שעת ${candidate.title} עודכנה ביומן ל־${candidate.time}`, statusDetail: 'טופל ✓ אין צורך בפעולה נוספת', updatedAt: timestamp } : entry),
    }
    return addActivityOnce(next, signal, 'completed', `שעת ${candidate.title} עודכנה ביומן ל־${candidate.time}.`, item.relatedMemberIds)
  }
  if (action === 'createTask' && signal.taskCandidate) {
    const candidate = signal.taskCandidate
    const taskId = `showcase-task:${signal.id}`
    const task: FamilyTask = { id: taskId, familyId: signal.familyId, title: candidate.title, ownerId: signal.ownerMemberId, due: candidate.dueDate, done: false, priority: candidate.priority, requiresAdult: true, sourceSignalId: signal.id }
    const tasks = data.tasks.some(entry => entry.id === taskId || entry.sourceSignalId === signal.id) ? data.tasks : [...data.tasks, task]
    let next: AppData = {
      ...data, tasks,
      externalSignals: (data.externalSignals || []).map(entry => entry.id === signal.id ? { ...entry, status: 'handled', resultTaskId: taskId } : entry),
      liaInterventions: (data.liaInterventions || []).map(entry => entry.id === itemId ? { ...entry, status: 'completed', actions: [], relatedTaskId: taskId, resolvedAt: timestamp, resolvedBy: actorId, resolutionType: 'taskCreated', resolutionSummary: 'נוצרה משימת אישור הורים', statusDetail: 'טופל ✓ המשימה נוספה לתוכנית', updatedAt: timestamp } : entry),
    }
    return addActivityOnce(next, signal, 'completed', `נוצרה משימה: ${candidate.title}.`, item.relatedMemberIds)
  }
  return data
}

export function resetShowcase(data: AppData, familyId: string, kind?: ShowcaseKind): AppData {
  const sourceIds: IntegrationSource[] = kind === 'whatsapp-calendar' ? ['whatsapp'] : kind === 'school-action' ? ['school', 'email'] : ['whatsapp', 'school', 'email']
  const signals = (data.externalSignals || []).filter(signal => signal.familyId === familyId && sourceIds.includes(signal.sourceId))
  const ids = new Set(signals.map(signal => signal.id))
  const originals = new Map(signals.filter(signal => signal.eventCandidate).map(signal => [signal.id, signal.eventCandidate!.originalTime]))
  return {
    ...data,
    events: data.events.map(event => event.sourceSignalId && ids.has(event.sourceSignalId) ? { ...event, time: originals.get(event.sourceSignalId) || event.time, sourceSignalId: undefined, sourceNote: undefined } : event),
    tasks: data.tasks.filter(task => !task.sourceSignalId || !ids.has(task.sourceSignalId)),
    activity: data.activity.filter(item => ![...ids].some(id => item.id.startsWith(`activity:showcase:${id}:`))),
    externalSignals: (data.externalSignals || []).filter(signal => !ids.has(signal.id)),
    liaInterventions: (data.liaInterventions || []).filter(item => !item.signalId || !ids.has(item.signalId)),
  }
}
