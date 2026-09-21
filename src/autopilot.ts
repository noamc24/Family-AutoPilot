import { dateLabel, localDate, uid, type AppData, type FamilyEvent, type FamilyUnit, type IntegrationLog, type IntegrationSource, type Person } from './data'
import { ensureRequests } from './coordination'
import { applyLatePlan, getLateImpact, pickupIneligibility, removeEventAndDependents, saveEventAndDependents } from './domain'
import { simulateIntegration } from './integrations'

export type AutopilotScenario = 'basketball' | 'friends' | 'birthday' | 'tutoring' | 'late' | 'traffic' | 'school-change' | 'cancel'
export const autopilotScenarios: { id: AutopilotScenario; label: string; icon: string }[] = [
  { id: 'basketball', label: 'אימון כדורסל חדש עם בקשת הסעה', icon: '🏀' },
  { id: 'friends', label: 'מפגש עם חברים נוסף ללוח', icon: '👋' },
  { id: 'birthday', label: 'יום הולדת חדש שמתנגש באירוע', icon: '🎂' },
  { id: 'tutoring', label: 'שיעור תגבור חדש', icon: '📚' },
  { id: 'late', label: 'עדכון על איחור בעבודה', icon: '⏰' },
  { id: 'traffic', label: 'עומס בכביש משנה את שעת היציאה', icon: '🚗' },
  { id: 'school-change', label: 'מייל מבית הספר משנה את שעת הסיום', icon: '🏫' },
  { id: 'cancel', label: 'ביטול אירוע בלוח המשפחתי', icon: '✕' },
]

export const automaticScenarios: AutopilotScenario[] = ['basketball', 'traffic', 'late', 'birthday', 'school-change', 'friends', 'tutoring']
export type ScenarioResult = { data: AppData; message: string; applied: boolean }
const unchanged = (data: AppData, message: string): ScenarioResult => ({ data, message, applied: false })
const minutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute }
const clock = (value: number) => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
const addedVerb = (person: Person) => person.role === 'בת' || person.role === 'אם' ? 'הוסיפה' : 'הוסיף'

export function scheduleConflicts(data: AppData, event: FamilyEvent): FamilyEvent[] {
  return data.events.filter(other => other.id !== event.id && other.familyId === event.familyId && other.date === event.date && Math.abs(minutes(other.time) - minutes(event.time)) < 75 &&
    (event.participantIds.some(id => other.participantIds.includes(id) || other.responsibleId === id) || !!event.responsibleId && (other.responsibleId === event.responsibleId || other.participantIds.includes(event.responsibleId))))
}

export function suggestScheduleSolution(data: AppData, event: FamilyEvent): { time: string; date: string; reason: string } | null {
  if (event.priority === 'critical' || !scheduleConflicts(data, event).length) return null
  for (const date of [event.date, localDate(1)]) {
    for (let offset = date === event.date ? 75 : 0; offset <= 240; offset += 15) {
      const candidate = { ...event, date, time: clock(minutes(event.time) + offset), departureTime: event.departureTime ? clock(minutes(event.departureTime) + offset) : undefined }
      if (date === event.date && minutes(candidate.time) <= minutes(event.time)) continue
      if (!scheduleConflicts(data, candidate).length && (!event.requiresDriver || data.families.find(f => f.id === event.familyId)?.people.some(p => !pickupIneligibility(p, candidate, data)))) {
        return { date, time: candidate.time, reason: `${dateLabel(date)} בשעה ${candidate.time} אין חפיפה לבני המשפחה המשתתפים${event.requiresDriver ? ', ויש נהג/ת כשיר/ה שאפשר לבקש ממנו/ה אישור' : ''}.` }
      }
    }
  }
  return null
}

export function applyScheduleSolution(data: AppData, eventId: string): AppData {
  const event = data.events.find(item => item.id === eventId)
  if (!event) return data
  const solution = suggestScheduleSolution(data, event)
  if (!solution) return data
  const offset = minutes(solution.time) - minutes(event.time)
  const updated = { ...event, date: solution.date, time: solution.time, departureTime: event.departureTime ? clock(minutes(event.departureTime) + offset) : undefined, details: `${event.details ? `${event.details} · ` : ''}השעה עודכנה כדי למנוע התנגשות` }
  const saved = saveEventAndDependents(data, updated)
  const requests = saved.transportationRequests.map(request => request.eventId === eventId ? { ...request, selectedDriverId: '', responses: Object.fromEntries(request.eligibleMemberIds.map(id => [id, 'PENDING' as const])), status: 'OPEN' as const } : request)
  const events = saved.events.map(item => item.id === eventId && item.requiresDriver ? { ...item, responsibleId: '', needsAttention: true } : item)
  return ensureRequests({ ...saved, events, transportationRequests: requests, activity: [{ id: uid(), familyId: event.familyId, text: `${event.title} הועבר ל־${solution.time} כדי למנוע התנגשות`, personIds: event.participantIds, createdAt: new Date().toISOString() }, ...saved.activity] }, event.createdById || event.participantIds[0] || '')
}

function record(data: AppData, familyId: string, scenarioKey: string, message: string, personIds: string[], trigger: 'manual' | 'automatic', source: IntegrationSource = 'family'): AppData {
  const entry: IntegrationLog = { id: uid(), familyId, scenarioKey, source, sourceText: source === 'school' ? 'מייל ממזכירות בית הספר' : 'עדכון מהלוח המשפחתי', action: message, personIds, createdAt: new Date().toISOString(), trigger }
  return { ...data, integrationLogs: [entry, ...data.integrationLogs], activity: [{ id: uid(), familyId, text: message, personIds }, ...data.activity] }
}

function childFor(family: FamilyUnit, scenario: AutopilotScenario): Person | undefined {
  const children = family.people.filter(person => person.age < 18)
  if (scenario === 'basketball') return children.find(person => person.name === 'עומר') || children[0]
  if (scenario === 'friends') return children.find(person => person.name === 'יואב') || children.find(person => person.role === 'בן') || children[0]
  return children.find(person => person.role === 'בן') || children[0]
}

export function runAutopilotScenario(data: AppData, familyId: string, scenario: AutopilotScenario, trigger: 'manual' | 'automatic' = 'manual'): ScenarioResult {
  const family = data.families.find(item => item.id === familyId)
  if (!family) return unchanged(data, 'לא נמצא תא משפחתי')
  const day = localDate()
  const scenarioKey = `autopilot:${familyId}:${day}:${scenario}`
  if (data.integrationLogs.some(entry => entry.scenarioKey === scenarioKey)) return unchanged(data, 'התרחיש הזה כבר התרחש היום')
  if (scenario === 'traffic') {
    return simulateIntegration(data, familyId, family.people.find(person => person.age >= 18)?.id || '', 'waze', trigger)
  }
  if (scenario === 'school-change') {
    const event = data.events.find(item => item.familyId === familyId && /בית ספר|טיול/.test(item.title) && item.date >= day)
    if (!event) return unchanged(data, 'אין כרגע פעילות בית ספר קרובה')
    const endTime = event.endTime ? clock(minutes(event.endTime) + 45) : '15:00'
    const updated = { ...event, endTime, sourceNote: 'זוהה מייל מבית הספר', details: `שעת הסיום עודכנה ל־${endTime}` }
    const next = saveEventAndDependents(data, updated)
    const message = `זיהיתי מייל מבית הספר: שעת הסיום של ${event.title} עודכנה ל־${endTime}.`
    return { data: record(next, familyId, scenarioKey, message, event.participantIds, trigger, 'school'), message, applied: true }
  }
  if (scenario === 'late') {
    const mother = family.people.find(person => person.role === 'אם')
    if (!mother) return unchanged(data, 'אין אם בתא המשפחתי הזה')
    const impact = getLateImpact(data, family, mother.id)
    if (!impact.hasChanges) return unchanged(data, 'אין כרגע שינוי בתוכנית בעקבות האיחור')
    const next = ensureRequests(applyLatePlan(data, family, mother.id, impact), mother.id)
    const message = `${mother.name} עדכנה שהיא מתעכבת בעבודה${impact.pickup ? ` ולא תוכל לבצע את ההסעה ל${impact.pickup.title}` : ''}. התוכנית עודכנה.`
    return { data: record(next, familyId, scenarioKey, message, [...new Set([mother.id, ...(impact.pickup?.participantIds || [])])], trigger), message, applied: true }
  }
  if (scenario === 'cancel') {
    const event = data.events.find(item => item.familyId === familyId && item.createdById && item.date >= day)
    if (!event) return unchanged(data, 'אין אירוע חדש שאפשר לבטל כרגע')
    const next = removeEventAndDependents(data, event.id)
    const author = family.people.find(person => person.id === event.createdById)
    const message = `${author?.name || 'בן משפחה'} ${author?.role === 'בת' || author?.role === 'אם' ? 'ביטלה' : 'ביטל'} את ${event.title}. האירוע, בקשת ההסעה והמשימות הקשורות הוסרו.`
    return { data: record(next, familyId, scenarioKey, message, event.participantIds, trigger), message, applied: true }
  }
  const child = childFor(family, scenario)
  if (!child) return unchanged(data, 'צריך להוסיף ילד/ה לתא המשפחתי כדי להפעיל את התרחיש')
  const details: Record<'basketball' | 'friends' | 'birthday' | 'tutoring', { title: string; date: string; time: string; icon: string; requiresDriver: boolean }> = {
    basketball: { title: 'אימון כדורסל', date: day, time: '17:00', icon: '🏀', requiresDriver: true },
    friends: { title: 'מפגש עם חברים', date: localDate(1), time: '17:30', icon: '👋', requiresDriver: false },
    birthday: { title: 'יום הולדת אצל חברים', date: day, time: '17:00', icon: '🎂', requiresDriver: true },
    tutoring: { title: 'שיעור תגבור', date: localDate(1), time: '16:00', icon: '📚', requiresDriver: true },
  }
  const template = details[scenario]
  const event: FamilyEvent = { id: uid(), familyId, ...template, participantIds: [child.id], responsibleId: '', createdById: child.id, details: `נוסף ללוח על ידי ${child.name}`, needsAttention: template.requiresDriver }
  const saved = saveEventAndDependents(data, event)
  const next = ensureRequests(saved, child.id)
  const conflict = scheduleConflicts(next, event)
  const message = `${child.name} ${addedVerb(child)} אירוע חדש: ${event.title} ${dateLabel(event.date)} ב־${event.time}${conflict.length ? ` · מתנגש עם ${conflict[0].title}` : template.requiresDriver ? ' · נדרשת הסעה' : ''}`
  return { data: record(next, familyId, scenarioKey, message, [child.id, ...conflict.flatMap(item => item.participantIds)], trigger), message, applied: true }
}

export function advanceAutomaticScenarios(data: AppData, familyId: string): ScenarioResult {
  for (const scenario of automaticScenarios) {
    const result = runAutopilotScenario(data, familyId, scenario, 'automatic')
    if (result.applied) return result
  }
  return unchanged(data, '')
}
