import { localDate, uid, type AppData, type FamilyEvent, type IntegrationLog, type IntegrationSource } from './data'
import { ensureRequests } from './coordination'
import { saveEventAndDependents } from './domain'

export type IntegrationScenario = Exclude<IntegrationSource, 'family'>
export const integrationNames: Record<IntegrationSource, string> = {
  waze: 'וויז', whatsapp: 'וואטסאפ', school: 'בית הספר', university: 'האוניברסיטה', family: 'המשפחה',
}

export function detectIntegrationScenario(text: string): IntegrationScenario | null {
  if (/וואטסאפ|ווטסאפ|whatsapp/i.test(text)) return 'whatsapp'
  if (/וויז|waze|פקק|תנועה בדרך/i.test(text)) return 'waze'
  if (/אוניברסיט|מכללה|הרצאה|סמסטר/i.test(text)) return 'university'
  if (/בית\s*(?:ה)?ספר|מורה|טיול שנתי|מערכת לימודית/i.test(text)) return 'school'
  return null
}

function shiftTime(value: string, minutes: number) {
  const [hour, minute] = value.split(':').map(Number)
  const total = (hour * 60 + minute + minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function addLog(data: AppData, familyId: string, source: IntegrationSource, scenarioKey: string, sourceText: string, action: string, personIds: string[], eventId?: string, trigger: 'manual' | 'automatic' = 'manual'): AppData {
  const log: IntegrationLog = { id: uid(), familyId, scenarioKey, source, sourceText, action, personIds: [...new Set(personIds.filter(Boolean))], eventId, createdAt: new Date().toISOString(), trigger }
  return { ...data, integrationLogs: [log, ...data.integrationLogs], activity: [{ id: uid(), familyId, text: action, personIds: log.personIds }, ...data.activity] }
}

export function simulateIntegration(data: AppData, familyId: string, actorId: string, source: IntegrationScenario, trigger: 'manual' | 'automatic' = 'manual'): { data: AppData; message: string; applied: boolean } {
  const family = data.families.find(item => item.id === familyId)
  const actor = family?.people.find(person => person.id === actorId)
  if (!family || !actor) return { data, message: 'יש לבחור בן משפחה לפני בדיקת העדכונים.', applied: false }

  if (source === 'waze') {
    const event = data.events.filter(item => item.familyId === familyId && item.requiresDriver && item.responsibleId && item.date >= localDate())
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
      .find(item => item.responsibleId === actorId) || data.events.find(item => item.familyId === familyId && item.requiresDriver && item.responsibleId && item.date >= localDate())
    if (!event) return { data, message: 'אין כרגע הסעה משובצת שאפשר לעדכן עבורה שעת יציאה.', applied: false }
    const scenarioKey = `waze:${event.id}:${event.date}`
    if (data.integrationLogs.some(item => item.scenarioKey === scenarioKey)) return { data, message: 'עדכון התנועה הזה כבר הוחל על ההסעה.', applied: false }
    const departureTime = shiftTime(event.time, -45)
    const updated: FamilyEvent = { ...event, departureTime, routeMinutes: 35, sourceNote: 'זוהה עומס תנועה בוויז', details: `שעת היציאה עודכנה ל־${departureTime} בגלל עומס בדרך` }
    const next = saveEventAndDependents(data, updated)
    const action = `זיהיתי בוויז עומס בדרך ל${event.title}. שעת היציאה עודכנה ל־${departureTime}.`
    return { data: addLog(next, familyId, source, scenarioKey, `וויז: זמן הנסיעה המשוער הוא 35 דקות.`, action, [event.responsibleId, ...event.participantIds], event.id, trigger), message: action, applied: true }
  }

  if (source === 'whatsapp') {
    const sender = family.people.find(person => person.id !== actorId && person.age >= 18) || family.people.find(person => person.id !== actorId)
    const child = family.people.find(person => person.age < 18)
    if (!sender) return { data, message: 'צריך לפחות עוד בן משפחה כדי לעדכן משיחת וואטסאפ.', applied: false }
    const date = localDate(1)
    const scenarioKey = `whatsapp:${familyId}:${actorId}:${date}`
    if (data.integrationLogs.some(item => item.scenarioKey === scenarioKey)) return { data, message: 'האירוע מהשיחה כבר נוסף ליומן.', applied: false }
    const title = child ? `בדיקת עיניים ל${child.name}` : 'בדיקת עיניים משפחתית'
    const event: FamilyEvent = { id: uid(), familyId, title, date, time: '18:00', icon: '👁️', participantIds: [...new Set([actorId, sender.id, child?.id].filter((id): id is string => !!id))], responsibleId: actorId, sourceNote: `זוהתה הודעת וואטסאפ מ${sender.name}`, details: 'התור נוסף ללוח המשפחתי וליומן גוגל' }
    const next = { ...data, events: [...data.events, event], calendarMirrors: [...data.calendarMirrors, { id: uid(), familyId, eventId: event.id, personId: actorId, provider: 'google' as const, createdAt: new Date().toISOString() }] }
    const action = `זיהיתי בוואטסאפ הודעה מ${sender.name} על ${title}. האירוע נוסף ללוח וליומן גוגל למחר ב־18:00.`
    return { data: addLog(next, familyId, source, scenarioKey, `וואטסאפ · ${sender.name}: ״קבענו ${title} למחר בשש, תוכל/י להוסיף ליומן?״`, action, event.participantIds, event.id, trigger), message: action, applied: true }
  }

  if (source === 'school') {
    const trip = data.events.find(item => item.familyId === familyId && /טיול|בית ספר/.test(item.title) && item.date >= localDate())
    if (!trip) return { data, message: 'אין אירוע בית ספר קרוב שאפשר לעדכן.', applied: false }
    const scenarioKey = `school:${trip.id}:${trip.date}`
    if (data.integrationLogs.some(item => item.scenarioKey === scenarioKey)) return { data, message: 'עדכון בית הספר הזה כבר הוחל.', applied: false }
    const newTime = shiftTime(trip.time, 60)
    const updated: FamilyEvent = { ...trip, time: newTime, sourceNote: 'זוהה מייל מבית הספר', details: 'שעת היציאה עודכנה · להביא אישור חתום' }
    const guardian = actor.age >= 18 ? actor : family.people.find(person => person.age >= 18)
    const dueDate = new Date(`${trip.date}T12:00:00`)
    dueDate.setDate(dueDate.getDate() - 1)
    const due = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`
    const updatedData = saveEventAndDependents(data, updated)
    const next = { ...updatedData, tasks: [...updatedData.tasks, { id: uid(), familyId, title: 'להביא אישור חתום לטיול', ownerId: guardian?.id || '', due, done: false, eventId: trip.id, requiresAdult: true }] }
    const action = `זיהיתי מייל מבית הספר: ${trip.title} יתחיל ב־${newTime}. הוספתי משימה להביא אישור חתום.`
    return { data: addLog(next, familyId, source, scenarioKey, `מייל מבית הספר: ״${trip.title} יתחיל שעה מאוחר יותר. יש להביא אישור חתום.״`, action, [...trip.participantIds, guardian?.id || ''], trip.id, trigger), message: action, applied: true }
  }

  const student = actor.age >= 18 ? actor : family.people.find(person => person.age >= 18)
  if (!student) return { data, message: 'צריך בן משפחה מבוגר כדי לקבל עדכון מהאוניברסיטה.', applied: false }
  const date = localDate(2)
  const scenarioKey = `university:${familyId}:${student.id}:${date}`
  if (data.integrationLogs.some(item => item.scenarioKey === scenarioKey)) return { data, message: 'האירוע האקדמי הזה כבר נוסף ליומן.', applied: false }
  const event: FamilyEvent = { id: uid(), familyId, title: 'הרצאה באוניברסיטה', date, time: '09:00', icon: '🎓', participantIds: [student.id], responsibleId: student.id, sourceNote: 'זוהה מייל ממערכת האוניברסיטה', details: 'ההרצאה נוספה ללוח וליומן גוגל' }
  const next = ensureRequests({ ...data, events: [...data.events, event], calendarMirrors: [...data.calendarMirrors, { id: uid(), familyId, eventId: event.id, personId: student.id, provider: 'google' as const, createdAt: new Date().toISOString() }] }, actorId)
  const action = `זיהיתי מייל ממערכת האוניברסיטה על הרצאה חדשה. האירוע נוסף ללוח וליומן גוגל של ${student.name}.`
  return { data: addLog(next, familyId, source, scenarioKey, 'מייל ממערכת האוניברסיטה: ״הרצאה חדשה בעוד יומיים בשעה 09:00.״', action, [student.id], event.id, trigger), message: action, applied: true }
}

export function advanceAutomaticIntegrations(data: AppData, familyId: string, actorId: string) {
  for (const source of ['waze', 'school', 'whatsapp', 'university'] as const) {
    const result = simulateIntegration(data, familyId, actorId, source, 'automatic')
    if (result.applied) return result
  }
  return { data, message: '', applied: false }
}

