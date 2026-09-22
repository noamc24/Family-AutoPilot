import { uid, type AppData, type FamilyEvent, type Person, type TransportationRequest } from './data'
import { pickupIneligibility } from './domain'

export function requestForEvent(data: AppData, eventId: string) { return data.transportationRequests.find(request => request.eventId === eventId) }

export function requestStatus(request: TransportationRequest): TransportationRequest['status'] {
  if (request.status === 'CANCELLED') return 'CANCELLED'
  if (request.selectedDriverId) return 'COVERED'
  const answers = request.eligibleMemberIds.map(id => request.responses[id] || 'PENDING')
  if (!answers.length || answers.every(answer => answer === 'CANNOT_DO')) return 'UNRESOLVED'
  return answers.some(answer => answer !== 'PENDING') ? 'PARTIALLY_RESPONDED' : 'OPEN'
}

export function eligibleDrivers(data: AppData, event: FamilyEvent): Person[] {
  const family = data.families.find(f => f.id === event.familyId)
  return (family?.people || []).filter(person => !pickupIneligibility(person, event, data))
}

export function createRequest(data: AppData, event: FamilyEvent, actorId: string): TransportationRequest {
  const eligibleMemberIds = eligibleDrivers(data, event).map(person => person.id)
  const responses = Object.fromEntries(eligibleMemberIds.map(id => [id, 'PENDING' as const]))
  const request: TransportationRequest = { id: uid(), familyId: event.familyId, eventId: event.id, passengerId: event.participantIds[0] || '', eligibleMemberIds, responses, selectedDriverId: '', status: 'OPEN', createdById: actorId, origin: 'מיקום האירוע', destination: 'היעד המשפחתי', requiredAt: `${event.date}T${event.time}` }
  return { ...request, status: requestStatus(request) }
}

/** Synchronize requests after edits to members, schedules and availability. */
export function reconcileTransportation(data: AppData): AppData {
  const transportationRequests = data.transportationRequests.filter(request => data.events.some(event => event.id === request.eventId && event.requiresDriver)).map(request => {
    const event = data.events.find(item => item.id === request.eventId)!
    const eligibleMemberIds = eligibleDrivers(data, event).map(person => person.id)
    const responses = Object.fromEntries(eligibleMemberIds.map(id => [id, request.responses[id] || 'PENDING']))
    const selectedDriverId = eligibleMemberIds.includes(request.selectedDriverId) && responses[request.selectedDriverId] === 'CAN_DO' ? request.selectedDriverId : ''
    const next = { ...request, eligibleMemberIds, responses, selectedDriverId, passengerId: event.participantIds.includes(request.passengerId) ? request.passengerId : event.participantIds[0] || '', requiredAt: `${event.date}T${event.time}` }
    return { ...next, status: requestStatus(next) }
  })
  const events = data.events.map(event => {
    const request = transportationRequests.find(item => item.eventId === event.id)
    return request ? { ...event, responsibleId: request.selectedDriverId, needsAttention: !request.selectedDriverId, issueReason: request.selectedDriverId ? undefined : event.issueReason, details: request.selectedDriverId ? `${data.families.find(f => f.id === event.familyId)?.people.find(p => p.id === request.selectedDriverId)?.name || 'בן משפחה'} אחראי/ת להסעה` : request.status === 'UNRESOLVED' ? 'אין כרגע נהג/ת להסעה' : 'בקשת הסעה ממתינה לתשובות' } : event
  })
  return { ...data, transportationRequests, events }
}

export function ensureRequests(data: AppData, actorId: string): AppData {
  const invalidIds = new Set(data.events.filter(event => event.requiresDriver && event.responsibleId && !!pickupIneligibility(data.families.find(f => f.id === event.familyId)?.people.find(p => p.id === event.responsibleId) || { id: '', name: '', role: 'בן', color: '', age: 0, hasLicense: false, hasCar: false, availableForPickup: false }, event, data)).map(event => event.id))
  let next = invalidIds.size ? { ...data, events: data.events.map(event => invalidIds.has(event.id) ? { ...event, responsibleId: '', needsAttention: true, issueReason: event.issueReason || 'הנהג/ת ששובץ/ה אינו/ה יכול/ה להגיע בזמן היציאה המעודכן' } : event) } : data
  for (const event of next.events.filter(item => item.requiresDriver && !item.responsibleId && !requestForEvent(next, item.id))) {
    next = { ...next, transportationRequests: [...next.transportationRequests, createRequest(next, event, actorId)], activity: [{ id: uid(), familyId: event.familyId, text: `נפתחה בקשת הסעה עבור ${event.title}`, personIds: event.participantIds, eventId: event.id, source: 'family', createdAt: new Date().toISOString() }, ...next.activity] }
  }
  return reconcileTransportation(next)
}

export function respondToRequest(data: AppData, requestId: string, personId: string, response: 'CAN_DO' | 'CANNOT_DO'): AppData {
  const request = data.transportationRequests.find(item => item.id === requestId)
  if (!request || !request.eligibleMemberIds.includes(personId) || request.status === 'CANCELLED' || request.status === 'COVERED' && request.selectedDriverId !== personId) return data
  const next = { ...request, responses: { ...request.responses, [personId]: response }, selectedDriverId: request.selectedDriverId === personId && response === 'CANNOT_DO' ? '' : request.selectedDriverId }
  return reconcileTransportation({ ...data, transportationRequests: data.transportationRequests.map(item => item.id === requestId ? { ...next, status: requestStatus(next) } : item) })
}

export function confirmDriver(data: AppData, requestId: string, personId: string): AppData {
  const request = data.transportationRequests.find(item => item.id === requestId)
  if (!request || request.responses[personId] !== 'CAN_DO' || !request.eligibleMemberIds.includes(personId)) return data
  return reconcileTransportation({ ...data, transportationRequests: data.transportationRequests.map(item => item.id === requestId ? { ...item, selectedDriverId: personId, status: 'COVERED' } : item) })
}

export type DriverOption = { person: Person; reason: string; score: number }
export function rankedDrivers(data: AppData, request: TransportationRequest): DriverOption[] {
  const family = data.families.find(item => item.id === request.familyId)
  const event = data.events.find(item => item.id === request.eventId)
  if (!family || !event) return []
  const candidates = family.people.filter(person => request.responses[person.id] === 'CAN_DO' && !pickupIneligibility(person, event, data))
  return candidates.map(person => {
    const load = data.events.filter(item => item.id !== event.id && item.familyId === family.id && item.date === event.date && item.requiresDriver && item.responsibleId === person.id).length
    const travel = person.travelMinutes
    const reasons = ['אישר/ה שהוא/היא יכול/ה להסיע ועומד/ת בתנאי הנהיגה והזמן']
    let score = 100
    if (event.preferredDriverId === person.id) { score += 30; reasons.push('זה הנהג המועדף לאירוע') }
    if (family.preferences?.preferNearbyDriver !== false && travel !== undefined) { score -= Math.min(travel, 90) * 0.8; reasons.push(`זמן ההגעה הידוע הוא כ-${travel} דקות`) }
    if (family.preferences?.balanceRides !== false) { score -= load * 14; reasons.push(`כבר משובץ/ת ל-${load} הסעות נוספות באותו יום`) }
    if (family.preferences?.preferFewerTrips && load > 0) { score += 8; reasons.push('כבר מתוכננת לו/ה נסיעה באותו יום') }
    if (person.preferredMaxRides !== undefined && load >= person.preferredMaxRides) { score -= 35; reasons.push('הגיע/ה למספר ההסעות המועדף ליום') }
    if (person.lastResortDriver) { score -= 45; reasons.push('מוגדר/ת כאפשרות אחרונה') }
    if (person.role !== 'אב' && person.role !== 'אם') score -= 8
    return { person, score, reason: `${person.name} נבחר/ה כי: ${reasons.join('; ')}.` }
  }).sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name, 'he') || a.person.id.localeCompare(b.person.id))
}
export function recommendDriver(data: AppData, request: TransportationRequest): DriverOption | null { return rankedDrivers(data, request)[0] || null }

export function transitAlternative(data: AppData, request: TransportationRequest): { title: string; reason: string } | null {
  const event = data.events.find(item => item.id === request.eventId)
  const family = data.families.find(item => item.id === request.familyId)
  const passenger = family?.people.find(item => item.id === request.passengerId)
  if (!event?.transitAvailable || !family?.preferences?.allowPublicTransit || !passenger?.canUseTransit || !passenger.canTravelAlone || passenger.age < 12) return null
  if (event.sourceNote?.includes('ביטול בתחבורה הציבורית')) return null
  if (data.integrationLogs.some(log => log.familyId === family.id && log.source === 'weather' && /גשם כבד/.test(log.action) && log.action.includes(event.title))) return null
  return { title: `${passenger.name} יגיע/תגיע בתחבורה ציבורית`, reason: 'המשפחה מאפשרת תחבורה ציבורית, קיימת חלופה לאירוע, ובן/בת המשפחה רשאי/ת לנסוע לבד. ב-Moovit נבדוק את הקו, התחנה ואת שעת היציאה עד הבית/היעד.' }
}
export function applyTransitAlternative(data: AppData, requestId: string): AppData {
  const request = data.transportationRequests.find(item => item.id === requestId)
  if (!request || !transitAlternative(data, request)) return data
  return reconcileTransportation({ ...data, events: data.events.map(event => event.id === request.eventId ? { ...event, requiresDriver: false, responsibleId: '', needsAttention: false, details: 'הגעה בתחבורה ציבורית באישור המשפחה · יש לבדוק קו ב-Moovit' } : event), transportationRequests: data.transportationRequests.filter(item => item.id !== requestId) })
}

function isSchoolEvent(event: FamilyEvent | undefined) {
  return !!event && /בית\s*ספר|טיול|לימודים|מסגרת\s*לימודית|שיעור|בית-ספר/i.test(`${event.title} ${event.details || ''}`)
}

export function alternativeForRequest(data: AppData, request: TransportationRequest) {
  const event = data.events.find(item => item.id === request.eventId)
  if (!event || request.status !== 'UNRESOLVED') return null
  if (!request.eligibleMemberIds.length) return null
  const family = data.families.find(item => item.id === request.familyId)
  const transit = transitAlternative(data, request)
  if (isSchoolEvent(event) && transit) {
    return { kind: 'transit' as const, title: `${event.title} · תחבורה ציבורית`, reason: 'לשינוי של יותר מ-30 דקות מבית הספר לא מוצע שינוי בשעה. לפי הכלל, בוחרים תחבורה ציבורית, בודקים קו ב-Moovit, ומעדכנים את הילד ואת ההורים לגבי התחנה והשעה.' }
  }
  const task = family?.preferences?.moveFlexibleTasks === false ? undefined : data.tasks.find(item => item.familyId === request.familyId && item.due === event.date && !item.done && item.flexible !== false && item.priority !== 'critical' && item.priority !== 'high' && request.eligibleMemberIds.includes(item.ownerId) && request.responses[item.ownerId] === 'CANNOT_DO' && !item.eventId)
  if (task) return { kind: 'task' as const, taskId: task.id, title: `לדחות את "${task.title}" ליום הבא ולשאול שוב את מי שאחראי/ת לה`, reason: 'המשימה גמישה ונמצאת באותו יום כמו ההסעה. דחייתה מפנה זמן, אך עדיין נדרשת תשובה חדשה מהנהג/ת.' }
  if (event.priority === 'critical') return null
  const [hour, minute] = event.time.split(':').map(Number)
  const newTime = `${String(Math.floor((hour * 60 + minute + 15) / 60) % 24).padStart(2, '0')}:${String((minute + 15) % 60).padStart(2, '0')}`
  return { kind: 'time' as const, title: `לבדוק איסוף בשעה ${newTime} ולבקש תשובות מחדש`, newTime, reason: 'שינוי של רבע שעה עשוי לפתור חפיפה, אך אינו מבטיח שנהג/ת יוכלו להגיע. יש לתאם את השעה עם המקום לפני אישור.' }
}

export function applyAlternativePlan(data: AppData, requestId: string): AppData {
  const request = data.transportationRequests.find(item => item.id === requestId)
  if (!request) return data
  const alternative = alternativeForRequest(data, request)
  if (!alternative) return data
  if (alternative.kind === 'transit') return applyTransitAlternative(data, requestId)
  let tasks = data.tasks
  let events = data.events
  if (alternative.kind === 'task') {
    const event = events.find(item => item.id === request.eventId)!
    const following = new Date(`${event.date}T12:00:00`)
    following.setDate(following.getDate() + 1)
    const due = `${following.getFullYear()}-${String(following.getMonth() + 1).padStart(2, '0')}-${String(following.getDate()).padStart(2, '0')}`
    tasks = tasks.map(task => task.id === alternative.taskId ? { ...task, due } : task)
  }
  else events = events.map(event => event.id === request.eventId ? { ...event, time: alternative.newTime } : event)
  const transportationRequests = data.transportationRequests.map(item => item.id === requestId ? { ...item, selectedDriverId: '', responses: Object.fromEntries(item.eligibleMemberIds.map(id => [id, alternative.kind === 'task' && id !== data.tasks.find(task => task.id === alternative.taskId)?.ownerId ? item.responses[id] : 'PENDING' as const])), status: 'OPEN' as const } : item)
  return reconcileTransportation({ ...data, tasks, events, transportationRequests })
}
