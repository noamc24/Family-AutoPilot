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
  let next = data
  for (const event of data.events.filter(item => item.requiresDriver && !item.responsibleId && !requestForEvent(next, item.id))) {
    next = { ...next, transportationRequests: [...next.transportationRequests, createRequest(next, event, actorId)] }
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

export function recommendDriver(data: AppData, request: TransportationRequest): { person: Person; reason: string } | null {
  const family = data.families.find(item => item.id === request.familyId)
  const event = data.events.find(item => item.id === request.eventId)
  if (!family || !event) return null
  const candidates = family.people.filter(person => request.responses[person.id] === 'CAN_DO' && !pickupIneligibility(person, event, data))
  const travelMinutes = (person: Person) => person.id === 'adam' ? 12 : person.id === 'maya' ? 18 : 15
  candidates.sort((a, b) => {
    const load = (person: Person) => data.events.filter(item => item.familyId === family.id && item.date === event.date && item.responsibleId === person.id).length
    return load(a) - load(b) || travelMinutes(a) - travelMinutes(b) || a.name.localeCompare(b.name, 'he') || a.id.localeCompare(b.id)
  })
  const person = candidates[0]
  if (!person) return null
  const load = data.events.filter(item => item.familyId === family.id && item.date === event.date && item.responsibleId === person.id).length
  return { person, reason: `${person.name} אישר/ה זמינות, עומד/ת בתנאי גיל, רישיון ורכב, ויש לו/ה ${load} שיבוצים אחרים באותו יום. זמן הנסיעה המשוער הוא ${travelMinutes(person)} דקות. מבין המאשרים נבחר קודם העומס הנמוך ביותר, ואז זמן הנסיעה הקצר יותר.` }
}

export function alternativeForRequest(data: AppData, request: TransportationRequest) {
  const event = data.events.find(item => item.id === request.eventId)
  if (!event || request.status !== 'UNRESOLVED') return null
  if (!request.eligibleMemberIds.length) return null
  const task = data.tasks.find(item => item.familyId === request.familyId && item.due === event.date && !item.done && request.eligibleMemberIds.includes(item.ownerId) && request.responses[item.ownerId] === 'CANNOT_DO' && !item.eventId)
  if (task) return { kind: 'task' as const, taskId: task.id, title: `לדחות את ״${task.title}״ ליום הבא ולשאול שוב את מי שאחראי/ת לה`, reason: 'המשימה האישית נמצאת באותו יום כמו ההסעה. שינוי המועד מפנה מקום בתוכנית, אבל עדיין נדרשת תשובה חדשה מהנהג/ת.' }
  const [hour, minute] = event.time.split(':').map(Number)
  const newTime = `${String(Math.floor((hour * 60 + minute + 15) / 60) % 24).padStart(2, '0')}:${String((minute + 15) % 60).padStart(2, '0')}`
  return { kind: 'time' as const, title: `לבדוק איסוף בשעה ${newTime} ולבקש תשובות מחדש`, newTime, reason: 'שינוי של רבע שעה עשוי לפתור חפיפה, אך אינו מבטיח שנהג/ת יוכלו להגיע. יש לתאם את השעה עם המקום לפני אישור.' }
}

export function applyAlternativePlan(data: AppData, requestId: string): AppData {
  const request = data.transportationRequests.find(item => item.id === requestId)
  if (!request) return data
  const alternative = alternativeForRequest(data, request)
  if (!alternative) return data
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
