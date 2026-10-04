import { ensureRequests } from './coordination'
import { localDate, uid, type AppData, type FamilyEvent, type IntegrationSource } from './data'
import { saveEventAndDependents } from './domain'
import { addLog } from './integrations'
import { memberAllowsSource } from './trafficSignals'

// Presentation-only: repeatable, keyboard-triggered scenarios with no visible controls.
export type PresentationShortcut = 'traffic' | 'wedding' | 'rain'

const shiftTime = (value: string, minutes: number) => {
  const [hour, minute] = value.split(':').map(Number)
  const total = (hour * 60 + minute + minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const sourceFor: Record<PresentationShortcut, IntegrationSource> = { traffic: 'waze', wedding: 'whatsapp', rain: 'weather' }

export function runPresentationShortcut(data: AppData, familyId: string, actorId: string, shortcut: PresentationShortcut) {
  const family = data.families.find(item => item.id === familyId)
  const actor = family?.people.find(person => person.id === actorId)
  const source = sourceFor[shortcut]
  if (!family || !actor) return { data, applied: false, message: 'יש לבחור בן משפחה לפני הפעלת העדכון.' }
  if (!memberAllowsSource(data, familyId, actorId, source)) return { data, applied: false, message: 'המקור אינו מחובר או אינו מאושר עבור המשתמש הנוכחי.' }

  const occurrence = `${Date.now()}:${uid()}`
  if (shortcut === 'traffic') {
    const event = data.events
      .filter(item => item.familyId === familyId && item.date >= localDate() && item.requiresDriver)
      .sort((left, right) => `${left.date}${left.time}`.localeCompare(`${right.date}${right.time}`))[0]
    if (!event) return { data, applied: false, message: 'אין כרגע אירוע עם נסיעה שאפשר לעדכן.' }
    const currentDeparture = event.departureTime || shiftTime(event.time, -(event.routeMinutes || 30))
    const departureTime = shiftTime(currentDeparture, -10)
    const updated: FamilyEvent = { ...event, departureTime, routeMinutes: (event.routeMinutes || 30) + 10, sourceNote: 'זוהה פקק בוויז', details: `שעת היציאה עודכנה ל־${departureTime} בעקבות עומס בדרך` }
    const next = ensureRequests(saveEventAndDependents(data, updated), actorId)
    const message = `זוהה פקק בוויז בדרך ל${event.title} — שעת היציאה עודכנה ל־${departureTime}.`
    return { data: addLog(next, familyId, 'waze', `presentation:traffic:${occurrence}`, 'וויז: זוהה עומס חדש בדרך.', message, [...event.participantIds, event.responsibleId], event.id), applied: true, message }
  }

  if (shortcut === 'wedding') {
    const existing = data.events.find(item => item.familyId === familyId && item.id === `presentation-wedding:${familyId}`)
    const date = existing ? localDate(Math.max(1, Math.round((new Date(`${existing.date}T12:00:00`).getTime() - new Date(`${localDate()}T12:00:00`).getTime()) / 86400000) + 1)) : localDate(14)
    const event: FamilyEvent = existing
      ? { ...existing, date, sourceNote: 'זוהתה הזמנה מעודכנת בוואטסאפ', details: 'ההזמנה המעודכנת נשמרה ביומן המשפחתי' }
      : { id: `presentation-wedding:${familyId}`, familyId, title: 'חתונה של נועה ויואב', date, time: '19:30', icon: '💍', participantIds: [actorId], responsibleId: actorId, createdById: actorId, sourceNote: 'זוהתה הזמנה לחתונה בוואטסאפ', details: 'ההזמנה נשמרה ביומן המשפחתי' }
    const saved = saveEventAndDependents(data, event)
    const mirrored = saved.calendarMirrors.some(item => item.eventId === event.id) ? saved : { ...saved, calendarMirrors: [...saved.calendarMirrors, { id: uid(), familyId, eventId: event.id, personId: actorId, provider: 'google' as const, createdAt: new Date().toISOString() }] }
    const message = `זוהתה הזמנה לחתונה בוואטסאפ — האירוע עודכן ביומן ל־${date}.`
    return { data: addLog(mirrored, familyId, 'whatsapp', `presentation:wedding:${occurrence}`, 'וואטסאפ: התקבלה הזמנה לחתונה.', message, [actorId], event.id), applied: true, message }
  }

  const event = data.events
    .filter(item => item.familyId === familyId && item.date >= localDate())
    .sort((left, right) => `${left.date}${left.time}`.localeCompare(`${right.date}${right.time}`))[0]
  if (!event) return { data, applied: false, message: 'אין אירוע קרוב שאפשר לעדכן לגביו את תחזית הגשם.' }
  const updated: FamilyEvent = { ...event, sourceNote: 'צפי לגשם כבד', details: 'מומלץ לקחת מעיל ולהיערך בהתאם' }
  const next = saveEventAndDependents(data, updated)
  const message = `יש צפי לגשם כבד בזמן ${event.title} — מומלץ לקחת מעיל ולהיערך בהתאם.`
  return { data: addLog(next, familyId, 'weather', `presentation:rain:${occurrence}`, 'תחזית מזג האוויר: צפי לגשם כבד.', message, event.participantIds, event.id), applied: true, message }
}
