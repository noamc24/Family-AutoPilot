import { ensureRequests, rankedDrivers, requestForEvent, respondToRequest, confirmDriver } from './coordination'
import { pickupIneligibility } from './domain'
import { type Activity, type AppData } from './data'
import type { LiaActionKind, LiaIntervention } from './liaInterventions'
import { isMeaningfulTrafficSignal, memberAllowsSource, recommendedDepartureTime, type TrafficSignal } from './trafficSignals'

const addActivityOnce = (data: AppData, id: string, text: string, personIds: string[], familyId: string): AppData => {
  if (data.activity.some(item => item.id === id)) return data
  const entry: Activity = { id, familyId, text, personIds, createdAt: new Date().toISOString(), source: 'family' }
  return { ...data, activity: [entry, ...data.activity] }
}

export function createTrafficIntervention(data: AppData, signal: TrafficSignal): AppData {
  if (!isMeaningfulTrafficSignal(signal) || (data.trafficSignals || []).some(item => item.id === signal.id)) return data
  const event = data.events.find(item => item.id === signal.relatedEventId && item.familyId === signal.familyId)
  if (!event?.responsibleId) return data
  if (!memberAllowsSource(data, signal.familyId, event.responsibleId, 'waze') || !memberAllowsSource(data, signal.familyId, event.responsibleId, 'calendar')) return data
  const departureTime = recommendedDepartureTime(event.time, signal.currentTravelMinutes)
  const timestamp = signal.timestamp
  const intervention: LiaIntervention = {
    id: `lia-traffic:${signal.id}`, familyId: signal.familyId, type: 'traffic', title: 'LIA זיהתה עומס בדרך',
    detectedChange: `זמן הנסיעה ל${event.title} עלה מ־${signal.previousTravelMinutes} ל־${signal.currentTravelMinutes} דקות.`,
    whyItMatters: `כדי להגיע בזמן לאירוע ב־${event.time}, צריך לעדכן את שעת היציאה.`, recommendation: `לצאת עד ${departureTime}.`,
    sources: [{ sourceId: 'waze', mode: 'demo' }, { sourceId: 'calendar', mode: 'demo' }], actions: [{ id: 'take', kind: 'takeOwnership', label: 'אני מטפל/ת', primary: true }, { id: 'cannot', kind: 'cannotDo', label: 'לא יכול/ה' }], status: 'decisionRequired',
    explanation: `האירוע מתחיל בשעה ${event.time}. זמן הנסיעה עלה מ־${signal.previousTravelMinutes} ל־${signal.currentTravelMinutes} דקות. עם מרווח ביטחון של 10 דקות, מומלץ לצאת עד ${departureTime}.`,
    relatedEventId: event.id, relatedMemberIds: [...new Set([event.responsibleId, ...event.participantIds].filter(Boolean))], createdAt: timestamp, updatedAt: timestamp, visibility: { audience: 'members', memberIds: [...new Set([event.responsibleId, ...event.participantIds].filter(Boolean))] },
  }
  let next: AppData = { ...data, trafficSignals: [...(data.trafficSignals || []), signal], liaInterventions: [intervention, ...(data.liaInterventions || [])], events: data.events.map(item => item.id === event.id ? { ...item, routeMinutes: signal.currentTravelMinutes, departureTime, sourceNote: 'זוהה עומס ב־Waze' } : item) }
  next = addActivityOnce(next, `activity:${intervention.id}:detected`, 'LIA זיהתה שינוי בזמן הנסיעה', intervention.relatedMemberIds, signal.familyId)
  return next
}

export function initializeTrafficCoreFlow(data: AppData): AppData {
  if (data.demoResetAt) return data
  return triggerTrafficCoreFlow(data)
}

/** Explicit showcase trigger; unlike passive initialization it remains available after Demo Reset. */
export function triggerTrafficCoreFlow(data: AppData): AppData {
  if ((data.trafficSignals || []).length || (data.liaInterventions || []).some(item => item.type === 'traffic')) return data
  const event = data.events.find(item => item.familyId === 'Avrahami' && item.id === 'traffic-pickup' && item.responsibleId)
  if (!event) return data
  return createTrafficIntervention(data, { id: `demo-waze:${event.id}:${event.date}`, familyId: event.familyId, source: 'waze', relatedEventId: event.id, previousTravelMinutes: event.routeMinutes || 18, currentTravelMinutes: 31, timestamp: new Date().toISOString(), severity: 'meaningful' })
}

export function trafficHandoffCandidates(data: AppData, interventionId: string) {
  const intervention = (data.liaInterventions || []).find(item => item.id === interventionId)
  const event = data.events.find(item => item.id === intervention?.relatedEventId)
  const request = event && requestForEvent(data, event.id)
  if (!intervention || !event || !request) return []
  return rankedDrivers(data, request).filter(option => request.responses[option.person.id] === 'PENDING' && !pickupIneligibility(option.person, event, data)).slice(0, 3)
}

export function applyTrafficFlowAction(data: AppData, interventionId: string, action: LiaActionKind, actorId: string, targetMemberId = ''): AppData {
  const intervention = (data.liaInterventions || []).find(item => item.id === interventionId)
  const event = data.events.find(item => item.id === intervention?.relatedEventId)
  const family = data.families.find(item => item.id === intervention?.familyId)
  const actor = family?.people.find(item => item.id === actorId)
  if (!intervention || !event || !family || !actor) return data
  const update = (changes: Partial<LiaIntervention>) => ({ ...data, liaInterventions: (data.liaInterventions || []).map(item => item.id === intervention.id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item) })
  if (action === 'dismiss') {
    const signal = (data.trafficSignals || []).find(item => item.id === intervention.id.replace('lia-traffic:', ''))
    const previousMinutes = signal?.previousTravelMinutes
    const departureTime = previousMinutes === undefined ? event.departureTime : recommendedDepartureTime(event.time, previousMinutes)
    return {
      ...data,
      events: data.events.map(item => item.id === event.id ? { ...item, routeMinutes: previousMinutes ?? item.routeMinutes, departureTime, sourceNote: undefined } : item),
      liaInterventions: (data.liaInterventions || []).map(item => item.id === intervention.id ? { ...item, status: 'noAction', actions: [], statusDetail: 'נדחה · לא בוצע שינוי', resolvedAt: new Date().toISOString(), resolvedBy: actorId, resolutionType: 'dismissed', resolutionSummary: 'ההמלצה נדחתה ולא הוחלה.', updatedAt: new Date().toISOString() } : item),
    }
  }
  if (action === 'reassign') {
    const target = family.people.find(person => person.id === targetMemberId)
    if (actor.age < 18 || !target || target.id === event.responsibleId || pickupIneligibility(target, event, data)) return data
    let next: AppData = { ...data, events: data.events.map(item => item.id === event.id ? { ...item, responsibleId: '', needsAttention: true } : item) }
    next = ensureRequests(next, actorId)
    const request = requestForEvent(next, event.id)
    if (!request?.eligibleMemberIds.includes(target.id)) return data
    next = respondToRequest(next, request.id, target.id, 'CAN_DO')
    next = confirmDriver(next, request.id, target.id)
    const summary = `האחריות ל${event.title} הועברה ל${target.name}.`
    next = { ...next, liaInterventions: (next.liaInterventions || []).map(item => item.id === intervention.id ? { ...item, status: 'completed', actions: [], statusDetail: summary, resolvedAt: new Date().toISOString(), resolvedBy: actorId, resolutionType: 'responsibilityTransferred', resolutionSummary: summary, updatedAt: new Date().toISOString() } : item) }
    return addActivityOnce(next, `activity:${intervention.id}:reassigned:${target.id}`, summary, [actorId, target.id], family.id)
  }
  if (action === 'takeOwnership' && event.responsibleId === actorId) {
    let next = update({ status: 'inProgress', statusDetail: `${actor.name} לקח/ה אחריות`, actions: [{ id: 'complete', kind: 'complete', label: 'אישור וסיום', primary: true }] })
    return addActivityOnce(next, `activity:${intervention.id}:owned:${actorId}`, `${actor.name} אישר/ה שהוא/היא מטפל/ת ב${event.title}`, [actorId], family.id)
  }
  if (action === 'complete' && event.responsibleId === actorId && intervention.status === 'inProgress') {
    const summary = `${actor.name} מטפל/ת ב${event.title}. אין צורך בפעולה נוספת.`
    let next = update({ status: 'completed', actions: [], resolvedAt: new Date().toISOString(), resolvedBy: actorId, resolutionType: 'responsibilityConfirmed', resolutionSummary: summary, statusDetail: summary })
    return addActivityOnce(next, `activity:${intervention.id}:closed`, `LIA סגרה את עדכון הנסיעה: ${actor.name} מטפל/ת`, [actorId], family.id)
  }
  if (action === 'cannotDo' && event.responsibleId === actorId) {
    let next: AppData = { ...data, events: data.events.map(item => item.id === event.id ? { ...item, responsibleId: '', needsAttention: true, issueReason: `${actor.name} סימן/ה שלא יכול/ה לבצע את ההסעה` } : item) }
    next = ensureRequests(next, actorId)
    const request = requestForEvent(next, event.id)
    if (request?.eligibleMemberIds.includes(actorId)) next = respondToRequest(next, request.id, actorId, 'CANNOT_DO')
    const refreshed = requestForEvent(next, event.id)
    const hasCandidate = !!refreshed?.eligibleMemberIds.some(id => id !== actorId && refreshed.responses[id] === 'PENDING')
    next = { ...next, liaInterventions: (next.liaInterventions || []).map(item => item.id === intervention.id ? { ...item, status: hasCandidate ? 'waiting' : 'decisionRequired', statusDetail: hasCandidate ? 'LIA מחפשת מי יכול לקחת אחריות' : 'אין כרגע נהג/ת חלופי/ת', actions: [], handoffRequestId: refreshed?.id, updatedAt: new Date().toISOString() } : item) }
    next = addActivityOnce(next, `activity:${intervention.id}:cannot:${actorId}`, `${actor.name} סימן/ה שלא יכול/ה לבצע את ההסעה`, [actorId], family.id)
    return refreshed ? addActivityOnce(next, `activity:${intervention.id}:request`, 'נשלחה בקשת אחריות לנהגים הכשירים', refreshed.eligibleMemberIds, family.id) : next
  }
  const request = requestForEvent(data, event.id)
  if (!request || !request.eligibleMemberIds.includes(actorId) || request.responses[actorId] !== 'PENDING') return data
  if (action === 'acceptHandoff') {
    let next = respondToRequest(data, request.id, actorId, 'CAN_DO')
    next = confirmDriver(next, request.id, actorId)
    const summary = `האחריות ל${event.title} הועברה ל${actor.name}. אין צורך בפעולה נוספת.`
    next = { ...next, liaInterventions: (next.liaInterventions || []).map(item => item.id === intervention.id ? { ...item, status: 'completed', statusDetail: summary, actions: [], resolvedAt: new Date().toISOString(), resolvedBy: actorId, resolutionType: 'responsibilityTransferred', resolutionSummary: summary, updatedAt: new Date().toISOString() } : item) }
    return addActivityOnce(next, `activity:${intervention.id}:accepted:${actorId}`, `${actor.name} קיבל/ה אחריות וה־flow נסגר`, [actorId], family.id)
  }
  if (action === 'declineHandoff') {
    let next = respondToRequest(data, request.id, actorId, 'CANNOT_DO')
    const refreshed = requestForEvent(next, event.id)
    const hasCandidate = !!refreshed?.eligibleMemberIds.some(id => refreshed.responses[id] === 'PENDING')
    next = { ...next, liaInterventions: (next.liaInterventions || []).map(item => item.id === intervention.id ? { ...item, status: hasCandidate ? 'waiting' : 'decisionRequired', statusDetail: hasCandidate ? 'ממתין לתגובה מנהג/ת אחר/ת' : 'אין כרגע מי שיכול/ה לקחת אחריות', updatedAt: new Date().toISOString() } : item) }
    return addActivityOnce(next, `activity:${intervention.id}:declined:${actorId}`, `${actor.name} השיב/ה שלא יכול/ה לקחת אחריות`, [actorId], family.id)
  }
  return data
}

export function resetTrafficDemo(data: AppData): AppData {
  const trafficIds = new Set((data.liaInterventions || []).filter(item => item.type === 'traffic').map(item => item.id))
  const cleaned = { ...data, trafficSignals: [], liaInterventions: (data.liaInterventions || []).filter(item => item.type !== 'traffic'), activity: data.activity.filter(item => ![...trafficIds].some(id => item.id.startsWith(`activity:${id}:`))) }
  return initializeTrafficCoreFlow(cleaned)
}
