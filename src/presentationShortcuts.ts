import { ensureRequests } from './coordination'
import { initialData, localDate, uid, type AppData, type FamilyEvent, type IntegrationSource, type Person } from './data'
import { saveEventAndDependents } from './domain'
import { addLog } from './integrations'
import { initializeTrafficCoreFlow } from './liaCoreFlow'
import { memberAllowsSource } from './trafficSignals'

// Presentation-only: repeatable, keyboard-triggered scenarios with no visible controls.
export type PresentationShortcut = 'traffic' | 'whatsapp' | 'weather' | 'family'

const shiftTime = (value: string, minutes: number) => {
  const [hour, minute] = value.split(':').map(Number)
  const total = (hour * 60 + minute + minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
const randomInt = (minimum: number, maximum: number) => minimum + Math.floor(Math.random() * (maximum - minimum + 1))
const randomItem = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]
const futureEvents = (data: AppData, familyId: string) => data.events.filter(item => item.familyId === familyId && item.date >= localDate())
const sourceFor: Record<PresentationShortcut, IntegrationSource> = { traffic: 'waze', whatsapp: 'whatsapp', weather: 'weather', family: 'family' }

function addCalendarEvent(data: AppData, event: FamilyEvent, personId: string) {
  const saved = saveEventAndDependents(data, event)
  return { ...saved, calendarMirrors: [...saved.calendarMirrors, { id: uid(), familyId: event.familyId, eventId: event.id, personId, provider: 'google' as const, createdAt: new Date().toISOString() }] }
}

/** Presentation-only: restore the single canonical demo seed and clear only its legacy storage namespace. */
export function resetPresentationDemo(): AppData {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (key?.startsWith('family-autopilot-')) localStorage.removeItem(key)
  }
  return initializeTrafficCoreFlow(ensureRequests(structuredClone(initialData), 'Mor'))
}

export function runPresentationShortcut(data: AppData, familyId: string, actorId: string, shortcut: PresentationShortcut) {
  const family = data.families.find(item => item.id === familyId)
  const actor = family?.people.find(person => person.id === actorId)
  const source = sourceFor[shortcut]
  if (!family || !actor) return { data, applied: false, message: 'יש לבחור בן משפחה לפני הפעלת העדכון.' }
  if (source !== 'family' && !memberAllowsSource(data, familyId, actorId, source)) return { data, applied: false, message: 'המקור אינו מחובר או אינו מאושר עבור המשתמש הנוכחי.' }

  const occurrence = `${Date.now()}:${uid()}`
  if (shortcut === 'traffic') {
    const candidates = futureEvents(data, familyId).filter(item => item.requiresDriver || item.responsibleId)
    const event = candidates.length ? randomItem(candidates) : undefined
    if (!event) return { data, applied: false, message: 'אין כרגע אירוע עם נסיעה שאפשר לעדכן.' }
    const minutes = randomInt(4, 17)
    const currentRouteMinutes = event.routeMinutes || 30
    const delayed = currentRouteMinutes - minutes < 8 || Math.random() >= .5
    const routeDelta = delayed ? minutes : -minutes
    const routeMinutes = currentRouteMinutes + routeDelta
    const currentDeparture = event.departureTime || shiftTime(event.time, -currentRouteMinutes)
    const departureTime = shiftTime(currentDeparture, -routeDelta)
    const change = delayed ? `התארך ב־${Math.abs(routeDelta)}` : `התקצר ב־${Math.abs(routeDelta)}`
    const updated: FamilyEvent = { ...event, departureTime, routeMinutes, sourceNote: 'זוהה שינוי בזמן הנסיעה בוויז', details: `זמן הנסיעה ${change} דקות. שעת היציאה עודכנה ל־${departureTime}` }
    const next = ensureRequests(saveEventAndDependents(data, updated), actorId)
    const message = `וויז עדכן שהנסיעה ל${event.title} ${change} דקות — שעת היציאה עודכנה ל־${departureTime}.`
    return { data: addLog(next, familyId, 'waze', `presentation:traffic:${occurrence}`, `וויז: זמן הנסיעה ${change} דקות.`, message, [...event.participantIds, event.responsibleId].filter(Boolean), event.id), applied: true, message }
  }

  if (shortcut === 'whatsapp') {
    const templates = [
      { title: 'יום הולדת של יעל', icon: '🎂', details: 'הזמנה שזוהתה בקבוצת הוואטסאפ', times: ['16:30', '17:00', '18:00'] },
      { title: 'חתונה של נועה ויואב', icon: '💍', details: 'הזמנה שזוהתה בהודעת וואטסאפ', times: ['18:30', '19:00', '19:30'] },
      { title: 'מפגש משפחות בפארק', icon: '🌳', details: 'המועד זוהה בקבוצת המשפחה', times: ['10:00', '11:30', '16:00'] },
      { title: 'תור לרופא ילדים', icon: '🩺', details: 'פרטי התור זוהו בהודעת וואטסאפ', times: ['09:30', '14:00', '17:15'] },
    ]
    const template = randomItem(templates)
    const participant = randomItem(family.people)
    const event: FamilyEvent = { id: `presentation-whatsapp:${occurrence}`, familyId, title: template.title, date: localDate(randomInt(2, 18)), time: randomItem(template.times), icon: template.icon, participantIds: [participant.id], responsibleId: actorId, createdById: actorId, sourceNote: 'זוהה אירוע חדש בוואטסאפ', details: template.details }
    const next = addCalendarEvent(data, event, participant.id)
    const message = `זיהיתי בוואטסאפ את ${event.title} והוספתי ליומן של ${participant.name} ב־${event.date} בשעה ${event.time}.`
    return { data: addLog(next, familyId, 'whatsapp', `presentation:whatsapp:${occurrence}`, `וואטסאפ: זוהה ${event.title}.`, message, [participant.id], event.id), applied: true, message }
  }

  if (shortcut === 'weather') {
    const events = futureEvents(data, familyId)
    const event = events.length ? randomItem(events) : undefined
    if (!event) return { data, applied: false, message: 'אין אירוע קרוב שאפשר לעדכן לגביו את מזג האוויר.' }
    const conditions = [
      { label: 'גשם כבד', icon: '🌧️', advice: 'כדאי להצטייד במעיל ולבדוק אפשרות להסעה' },
      { label: 'שרב קיצוני', icon: '☀️', advice: 'כדאי להצטייד במים ולהימנע משהייה ממושכת בחוץ' },
      { label: 'שלג', icon: '❄️', advice: 'כדאי לבדוק את מצב הדרכים לפני היציאה' },
      { label: 'רוחות חזקות', icon: '💨', advice: 'כדאי לבדוק אם הפעילות מתקיימת כרגיל' },
    ]
    const condition = randomItem(conditions)
    const updated: FamilyEvent = { ...event, sourceNote: `תחזית: ${condition.label}`, details: `${condition.label} צפוי בזמן האירוע. ${condition.advice}.` }
    const next = saveEventAndDependents(data, updated)
    const message = `${condition.icon} צפוי ${condition.label} בזמן ${event.title} — ${condition.advice}.`
    return { data: addLog(next, familyId, 'weather', `presentation:weather:${occurrence}`, `תחזית מזג האוויר: ${condition.label}.`, message, event.participantIds, event.id), applied: true, message }
  }

  const member = randomItem(family.people)
  const variants: ((person: Person) => Omit<FamilyEvent, 'id' | 'familyId' | 'createdById' | 'sourceNote'>)[] = [
    person => ({ title: `${person.name} נפגש/ת עם חברים`, date: localDate(randomInt(1, 5)), time: randomItem(['16:30', '17:00', '18:15']), icon: '👥', participantIds: [person.id], responsibleId: '', details: `${person.name} עדכן/ה על מפגש עם חברים` }),
    person => ({ title: `${person.name} מסיים/ת מוקדם`, date: localDate(randomInt(1, 3)), time: randomItem(['12:30', '13:00', '13:30']), icon: '🏫', participantIds: [person.id], responsibleId: '', details: `${person.name} עדכן/ה שהמסגרת מסתיימת מוקדם` }),
    person => ({ title: `תוכנית חדשה של ${person.name}`, date: localDate(randomInt(1, 7)), time: randomItem(['15:00', '17:30', '19:00']), icon: '💬', participantIds: [person.id], responsibleId: person.age >= 18 ? person.id : '', details: `${person.name} שלח/ה עדכון למשפחה` }),
  ]
  const draft = randomItem(variants)(member)
  const event: FamilyEvent = { ...draft, id: `presentation-family:${occurrence}`, familyId, createdById: member.id, sourceNote: `הודעה מ${member.name}` }
  const next = addCalendarEvent(data, event, member.id)
  const message = `${member.name} עדכן/ה: ${event.title} — הוספתי את העדכון ליומן המשפחתי.`
  return { data: addLog(next, familyId, 'family', `presentation:family:${occurrence}`, `הודעה מ${member.name}: ${event.title}.`, message, [member.id], event.id), applied: true, message }
}
