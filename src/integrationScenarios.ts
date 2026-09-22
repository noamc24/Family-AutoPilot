import { dateLabel, localDate, uid, type AppData, type FamilyEvent, type IntegrationSource, type Person } from './data'
import { ensureRequests, requestForEvent, respondToRequest } from './coordination'
import { applyLatePlan, getLateImpact, removeEventAndDependents, saveEventAndDependents } from './domain'
import { addLog, simulateIntegration } from './integrations'

export type ExternalScenarioId = 'waze-traffic' | 'waze-accident' | 'decision-demo' | 'calendar-meeting' | 'calendar-cancel' | 'whatsapp-appointment' | 'whatsapp-earlier' | 'whatsapp-no-pickup' | 'school-trip' | 'email-school-early' | 'university-lecture' | 'university-online' | 'weather-rain' | 'location-near' | 'work-late' | 'club-delay' | 'transit-cancel'
export type ExternalScenario = { id: ExternalScenarioId; source: IntegrationSource; title: string; description: string; icon: string }
export const externalScenarios: ExternalScenario[] = [
  { id: 'waze-traffic', source: 'waze', title: 'עומס בדרך להסעה', description: 'זמן הנסיעה ושעת היציאה משתנים.', icon: '🚗' },
  { id: 'waze-accident', source: 'waze', title: 'תאונה בדרך', description: 'היציאה מוקדמת ונבדק מחדש אם הנהג יספיק.', icon: '🚧' },
  { id: 'decision-demo', source: 'waze', title: 'איך נבחר נהג להסעה', description: 'שני הורים יכולים להסיע; מרחק ועומס משפיעים על ההמלצה.', icon: '🚗' },
  { id: 'calendar-meeting', source: 'calendar', title: 'פגישה שהתארכה', description: 'פגישת עבודה ביומן עלולה להתנגש עם הסעה.', icon: '📅' },
  { id: 'calendar-cancel', source: 'calendar', title: 'פגישה בוטלה', description: 'מועד הפגישה מתפנה וההסעות נבדקות שוב.', icon: '📅' },
  { id: 'whatsapp-appointment', source: 'whatsapp', title: 'תור שנקבע בשיחה', description: 'הודעה משפחתית מוסיפה אירוע ללוח.', icon: '💬' },
  { id: 'whatsapp-earlier', source: 'whatsapp', title: 'האימון הוקדם', description: 'שעת האימון משתנה ונבדקות חפיפות.', icon: '💬' },
  { id: 'whatsapp-no-pickup', source: 'whatsapp', title: 'אין צורך באיסוף', description: 'בקשת ההסעה של האירוע נסגרת.', icon: '💬' },
  { id: 'school-trip', source: 'school', title: 'שינוי בטיול בית הספר', description: 'שעת הטיול משתנה ונוספת משימה.', icon: '🏫' },
  { id: 'email-school-early', source: 'email', title: 'הלימודים מסתיימים מוקדם', description: 'מייל מבית הספר יוצר בקשת איסוף.', icon: '✉️' },
  { id: 'university-lecture', source: 'university', title: 'הרצאה חדשה', description: 'מועד חדש נוסף ללוח וליומן.', icon: '🎓' },
  { id: 'university-online', source: 'university', title: 'השיעור עבר למפגש מקוון', description: 'המיקום והזמינות של הלומד מתעדכנים.', icon: '🎓' },
  { id: 'weather-rain', source: 'weather', title: 'גשם כבד בשעת הפעילות', description: 'נבדק צורך בהסעה לפעילות חוץ.', icon: '🌧️' },
  { id: 'location-near', source: 'location', title: 'אבא קרוב לבית הספר', description: 'זמן ההגעה שלו מתקצר בהמלצת הנהג.', icon: '📍' },
  { id: 'work-late', source: 'work', title: 'אמא מתעכבת בעבודה', description: 'הזמינות מתעדכנת וההסעה נפתחת מחדש.', icon: '💼' },
  { id: 'club-delay', source: 'club', title: 'האימון נדחה', description: 'שעת האימון ובקשת ההסעה מתעדכנות.', icon: '⚽' },
  { id: 'transit-cancel', source: 'transit', title: 'האוטובוס בוטל', description: 'נפתחת בקשת הסעה חלופית.', icon: '🚌' },
]

const shift = (value: string, delta: number) => { const [hour, minute] = value.split(':').map(Number); const total = (hour * 60 + minute + delta + 1440) % 1440; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` }
const noChange = (data: AppData, message: string) => ({ data, message, applied: false })
const familyOf = (data: AppData, familyId: string) => data.families.find(family => family.id === familyId)
const eventFor = (data: AppData, familyId: string, pattern: RegExp) => data.events.find(event => event.familyId === familyId && event.date >= localDate() && pattern.test(event.title))
const assignedRide = (data: AppData, familyId: string) => data.events.find(event => event.familyId === familyId && event.date >= localDate() && event.requiresDriver && event.responsibleId)
const firstChild = (data: AppData, familyId: string) => familyOf(data, familyId)?.people.find(person => person.age < 18)

function finish(data: AppData, familyId: string, id: ExternalScenarioId, source: IntegrationSource, sourceText: string, message: string, personIds: string[], _eventId: string | undefined, trigger: 'manual' | 'automatic') {
  const scenarioKey = `external:${familyId}:${id}`
  return { data: addLog(data, familyId, source, scenarioKey, sourceText, message, personIds, undefined, trigger), message, applied: true }
}

function moveEvent(data: AppData, event: FamilyEvent, time: string, sourceNote: string, details: string, actorId: string) {
  const oldRequest = data.transportationRequests.find(request => request.eventId === event.id)
  const [oldHour, oldMinute] = event.time.split(':').map(Number)
  const [newHour, newMinute] = time.split(':').map(Number)
  const delta = (newHour * 60 + newMinute) - (oldHour * 60 + oldMinute)
  const updated = { ...event, time, departureTime: event.departureTime ? shift(event.departureTime, delta) : undefined, sourceNote, details, responsibleId: oldRequest ? '' : event.responsibleId, needsAttention: event.requiresDriver && !!oldRequest }
  const saved = saveEventAndDependents(data, updated)
  const transportationRequests = saved.transportationRequests.map(request => request.eventId === event.id ? { ...request, selectedDriverId: '', responses: Object.fromEntries(request.eligibleMemberIds.map(id => [id, 'PENDING' as const])), status: 'OPEN' as const } : request)
  return ensureRequests({ ...saved, transportationRequests }, actorId)
}

export function runExternalScenario(data: AppData, familyId: string, actorId: string, id: ExternalScenarioId, trigger: 'manual' | 'automatic' = 'manual') {
  const family = familyOf(data, familyId)
  if (!family) return noChange(data, 'לא נמצא תא משפחתי')
  const scenarioKey = `external:${familyId}:${id}`
  if (data.integrationLogs.some(log => log.scenarioKey === scenarioKey)) return noChange(data, 'העדכון הזה כבר נוסף לתוכנית')
  if (id === 'waze-traffic' || id === 'whatsapp-appointment' || id === 'school-trip' || id === 'university-lecture') return simulateIntegration(data, familyId, actorId, id === 'waze-traffic' ? 'waze' : id === 'whatsapp-appointment' ? 'whatsapp' : id === 'school-trip' ? 'school' : 'university', trigger)

  if (id === 'decision-demo') {
    const adults = family.people.filter(person => person.age >= 18 && person.hasLicense && person.hasCar && person.availableForPickup)
    const child = firstChild(data, familyId)
    if (adults.length < 2 || !child) return noChange(data, 'נדרשים שני נהגים כשירים וילד/ה בתא המשפחתי')
    const busy = adults.find(person => person.role === 'אם') || adults[0]
    const nearby = adults.find(person => person.id !== busy.id)!
    const date = localDate(1)
    const events: FamilyEvent[] = [
      { id: uid(), familyId, title: `סידור בוקר של ${busy.name}`, date, time: '10:00', icon: '🚗', participantIds: [child.id], responsibleId: busy.id, requiresDriver: true, details: 'הסעה מתוכננת' },
      { id: uid(), familyId, title: `סידור צהריים של ${busy.name}`, date, time: '13:00', icon: '🚗', participantIds: [child.id], responsibleId: busy.id, requiresDriver: true, details: 'הסעה מתוכננת' },
    ]
    const target: FamilyEvent = { id: uid(), familyId, title: `אימון אחר הצהריים של ${child.name}`, date, time: '17:00', icon: '🏀', participantIds: [child.id], responsibleId: '', requiresDriver: true, needsAttention: true, details: 'נדרשת הסעה לאימון', sourceNote: 'זמני הגעה עודכנו בוויז' }
    const families = data.families.map(item => item.id === familyId ? { ...item, people: item.people.map(person => person.id === busy.id ? { ...person, travelMinutes: 8 } : person.id === nearby.id ? { ...person, travelMinutes: 13 } : person) } : item)
    let next = ensureRequests({ ...data, families, events: [...data.events, ...events, target] }, actorId)
    const request = requestForEvent(next, target.id)
    if (request) { next = respondToRequest(next, request.id, busy.id, 'CAN_DO'); next = respondToRequest(next, request.id, nearby.id, 'CAN_DO') }
    const message = `וויז עדכן זמני הגעה לאימון של ${child.name}. ${busy.name} כבר משובץ/ת לשתי הסעות, ו-${nearby.name} אישר/ה זמינות. בדקתי את שתי האפשרויות.`
    return finish(next, familyId, id, 'waze', 'וויז: זמני הגעה מעודכנים לשני הנהגים.', message, [busy.id, nearby.id, child.id], target.id, trigger)
  }

  if (id === 'calendar-meeting') {
    const ride = assignedRide(data, familyId)
    if (!ride) return noChange(data, 'אין הסעה משובצת שאפשר לבדוק מול הפגישה')
    const driver = family.people.find(person => person.id === ride.responsibleId)!
    const originalDeparture = ride.departureTime || shift(ride.time, -30)
    const endTime = shift(originalDeparture, ride.departureTime ? 10 : -15)
    const meeting: FamilyEvent = { id: uid(), familyId, title: `פגישת עבודה של ${driver.name}`, date: ride.date, time: shift(endTime, -40), endTime, icon: '📅', participantIds: [driver.id], responsibleId: driver.id, details: `הפגישה מסתיימת ב-${endTime}`, sourceNote: 'זוהה שינוי ביומן גוגל' }
    const next = ensureRequests(saveEventAndDependents(data, meeting), actorId)
    const message = `זיהיתי ביומן גוגל שהפגישה של ${driver.name} תסתיים ב-${endTime}. בדקתי את ההשפעה על ההסעה ל${ride.title}.`
    return finish(next, familyId, id, 'calendar', `יומן גוגל: הפגישה מסתיימת ב-${endTime}.`, message, [driver.id, ...ride.participantIds], meeting.id, trigger)
  }
  if (id === 'calendar-cancel') {
    const meeting = data.events.find(event => event.familyId === familyId && event.sourceNote === 'זוהה שינוי ביומן גוגל' && /פגישת עבודה/.test(event.title))
    if (!meeting) return noChange(data, 'אין פגישת עבודה מעודכנת שאפשר לבטל')
    const next = ensureRequests(removeEventAndDependents(data, meeting.id), actorId)
    const message = `זיהיתי ביומן גוגל שהפגישה של ${family.people.find(person => person.id === meeting.responsibleId)?.name || 'בן המשפחה'} בוטלה. הזמינות להסעות נבדקה מחדש.`
    return finish(next, familyId, id, 'calendar', 'יומן גוגל: הפגישה בוטלה.', message, [meeting.responsibleId], undefined, trigger)
  }
  if (id === 'waze-accident') {
    const ride = assignedRide(data, familyId)
    if (!ride) return noChange(data, 'אין הסעה משובצת שאפשר לעדכן')
    const departureTime = shift(ride.time, -60)
    const next = ensureRequests(saveEventAndDependents(data, { ...ride, departureTime, routeMinutes: 50, details: `שעת היציאה עודכנה ל-${departureTime} בעקבות תאונה בדרך`, sourceNote: 'זוהתה תאונה בוויז' }), actorId)
    const message = `זיהיתי בוויז תאונה בדרך ל${ride.title}. זמן הנסיעה עלה ל-50 דקות והיציאה הוקדמה ל-${departureTime}.${next.events.find(event => event.id === ride.id)?.responsibleId ? '' : ' הנהג הקודם לא יספיק ונפתחה בקשת הסעה חדשה.'}`
    return finish(next, familyId, id, 'waze', 'וויז: תאונה בדרך וזמן נסיעה של 50 דקות.', message, [ride.responsibleId, ...ride.participantIds], ride.id, trigger)
  }
  if (id === 'whatsapp-earlier') {
    const event = eventFor(data, familyId, /אימון|חוג/)
    if (!event) return noChange(data, 'אין אימון קרוב שאפשר להקדים')
    const time = shift(event.time, -30)
    const next = moveEvent(data, event, time, 'זוהתה הודעה בוואטסאפ', `האימון הוקדם ל-${time}`, actorId)
    const message = `זיהיתי בוואטסאפ שהאימון ${event.title} הוקדם ל-${time}. בדקתי מחדש את החפיפות ואת בקשת ההסעה.`
    return finish(next, familyId, id, 'whatsapp', `וואטסאפ: "האימון הוקדם ל-${time}".`, message, event.participantIds, event.id, trigger)
  }
  if (id === 'whatsapp-no-pickup') {
    const event = data.events.find(item => item.familyId === familyId && item.date >= localDate() && item.requiresDriver && item.participantIds.some(personId => family.people.some(person => person.id === personId && person.age < 18)))
    if (!event) return noChange(data, 'אין בקשת הסעה פעילה שאפשר לבטל')
    const next = ensureRequests(saveEventAndDependents(data, { ...event, requiresDriver: false, responsibleId: '', needsAttention: false, details: 'אין צורך באיסוף ברכב', sourceNote: 'זוהתה הודעה בוואטסאפ' }), actorId)
    const message = `זיהיתי בוואטסאפ שאין צורך לאסוף ל${event.title}. בקשת ההסעה נסגרה והאירוע נשאר בלוח.`
    return finish(next, familyId, id, 'whatsapp', 'וואטסאפ: "לא צריך לאסוף אותי היום".', message, event.participantIds, event.id, trigger)
  }
  if (id === 'email-school-early') {
    const child = firstChild(data, familyId)
    if (!child) return noChange(data, 'אין ילד או ילדה בתא המשפחתי')
    const event: FamilyEvent = { id: uid(), familyId, title: `איסוף מוקדם של ${child.name} מבית הספר`, date: localDate(1), time: '13:00', icon: '🏫', participantIds: [child.id], responsibleId: '', requiresDriver: true, needsAttention: true, details: 'הלימודים מסתיימים מוקדם', sourceNote: 'זוהה מייל מבית הספר' }
    const next = ensureRequests(saveEventAndDependents(data, event), actorId)
    const message = `זיהיתי מייל מבית הספר: הלימודים של ${child.name} יסתיימו מחר ב-13:00. הוספתי איסוף ופתחתי בקשת הסעה.`
    return finish(next, familyId, id, 'email', 'מייל מבית הספר: הלימודים מסתיימים מוקדם.', message, [child.id], event.id, trigger)
  }
  if (id === 'university-online') {
    const event = eventFor(data, familyId, /אוניברסיטה|הרצאה|שיעור/)
    if (!event) return noChange(data, 'אין שיעור אקדמי קרוב שאפשר לעדכן')
    const student = family.people.find(person => person.id === event.participantIds[0])
    const saved = saveEventAndDependents(data, { ...event, details: 'השיעור עבר למפגש מקוון מהבית', sourceNote: 'זוהה עדכון ממערכת האוניברסיטה' })
    const families = student ? saved.families.map(item => item.id === familyId ? { ...item, people: item.people.map(person => person.id === student.id ? { ...person, availability: 'home' as const, travelMinutes: 8 } : person) } : item) : saved.families
    const next = ensureRequests({ ...saved, families }, actorId)
    const message = `זיהיתי במערכת האוניברסיטה שהשיעור של ${student?.name || 'בן המשפחה'} עבר למפגש מקוון. הזמינות מהבית עודכנה.`
    return finish(next, familyId, id, 'university', 'מערכת האוניברסיטה: השיעור עבר למפגש מקוון.', message, event.participantIds, event.id, trigger)
  }
  if (id === 'weather-rain') {
    const event = eventFor(data, familyId, /טיול|אימון|חוג/)
    if (!event) return noChange(data, 'אין פעילות חוץ קרובה שאפשר לבדוק')
    const child = event.participantIds.find(personId => family.people.some(person => person.id === personId && person.age < 18))
    const updated = { ...event, requiresDriver: !!child || !!event.requiresDriver, responsibleId: event.requiresDriver ? event.responsibleId : '', needsAttention: !!child && (!event.requiresDriver || !event.responsibleId), details: 'צפוי גשם כבד. כדאי לתאם הסעה במקום הליכה.', sourceNote: 'זוהתה תחזית לגשם כבד' }
    const next = ensureRequests(saveEventAndDependents(data, updated), actorId)
    const message = `זיהיתי בתחזית גשם כבד בשעת ${event.title}. התוכנית עודכנה${child ? ' ונבדק הצורך בהסעה' : ''}.`
    return finish(next, familyId, id, 'weather', 'תחזית מזג האוויר: גשם כבד בשעת הפעילות.', message, event.participantIds, event.id, trigger)
  }
  if (id === 'location-near') {
    const father = family.people.find(person => person.role === 'אב')
    if (!father) return noChange(data, 'אין אב בתא המשפחתי הזה')
    const families = data.families.map(item => item.id === familyId ? { ...item, people: item.people.map(person => person.id === father.id ? { ...person, travelMinutes: 6, availability: 'home' as const } : person) } : item)
    const next = ensureRequests({ ...data, families }, actorId)
    const message = `זיהיתי במיקום ש${father.name} קרוב לבית הספר. זמן ההגעה שלו הוא כ-6 דקות, וההמלצות להסעות עודכנו.`
    return finish(next, familyId, id, 'location', 'מיקום: מרחק נסיעה של כ-6 דקות מבית הספר.', message, [father.id], undefined, trigger)
  }
  if (id === 'work-late') {
    const mother = family.people.find(person => person.role === 'אם')
    if (!mother) return noChange(data, 'אין אם בתא המשפחתי הזה')
    const impact = getLateImpact(data, family, mother.id)
    if (!impact.hasChanges) return noChange(data, 'אין כרגע שינוי בתוכנית בעקבות האיחור')
    const next = ensureRequests(applyLatePlan(data, family, mother.id, impact), actorId)
    const message = `זיהיתי בעדכון מהעבודה ש${mother.name} מתעכבת. הזמינות וההסעות המתוכננות נבדקו מחדש.`
    return finish(next, familyId, id, 'work', 'מערכת העבודה: הפגישה נמשכת כשעה נוספת.', message, [mother.id, ...(impact.pickup?.participantIds || [])], undefined, trigger)
  }
  if (id === 'club-delay') {
    const event = eventFor(data, familyId, /אימון|חוג/)
    if (!event) return noChange(data, 'אין אימון קרוב שאפשר לדחות')
    const time = shift(event.time, 60)
    const next = moveEvent(data, event, time, 'זוהה עדכון מהחוג', `האימון נדחה ל-${time}`, actorId)
    const message = `זיהיתי עדכון מהחוג: ${event.title} נדחה ל-${time}. בדקתי את ההסעה והאירועים הסמוכים.`
    return finish(next, familyId, id, 'club', 'הודעת המאמן: האימון יתחיל שעה מאוחר יותר.', message, event.participantIds, event.id, trigger)
  }
  if (id === 'transit-cancel') {
    const child = firstChild(data, familyId)
    if (!child) return noChange(data, 'אין ילד או ילדה בתא המשפחתי')
    const event: FamilyEvent = { id: uid(), familyId, title: `הגעה חלופית ל${child.name}`, date: localDate(1), time: '08:15', icon: '🚌', participantIds: [child.id], responsibleId: '', requiresDriver: true, needsAttention: true, details: 'האוטובוס המתוכנן בוטל', sourceNote: 'זוהה ביטול בתחבורה הציבורית' }
    const next = ensureRequests(saveEventAndDependents(data, event), actorId)
    const message = `זיהיתי שמחר בבוקר האוטובוס של ${child.name} בוטל. פתחתי בקשת הסעה חלופית ל-08:15.`
    return finish(next, familyId, id, 'transit', 'תחבורה ציבורית: האוטובוס בוטל.', message, [child.id], event.id, trigger)
  }
  return noChange(data, 'אין עדכון זמין לתרחיש הזה')
}

export function advanceAutomaticExternalScenarios(data: AppData, familyId: string, actorId: string, excludedIds: string[] = []) {
  for (const id of ['calendar-meeting', 'waze-accident', 'whatsapp-earlier', 'email-school-early', 'weather-rain', 'location-near'] as const) {
    if (excludedIds.includes(`external:${familyId}:${id}`)) continue
    const result = runExternalScenario(data, familyId, actorId, id, 'automatic')
    if (result.applied) return { ...result, scenarioId: id }
  }
  return { data, message: '', applied: false }
}
