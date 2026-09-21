import { localDate, uid, type AppData, type FamilyEvent, type FamilyTask, type FamilyUnit, type Person } from './data'

const isAdult = (person: Person) => person.age >= 18
const localNow = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` }
export const canDrive = (person: Person) => person.activeDriver !== false && person.age >= 18 && person.hasLicense && person.hasCar && person.availableForPickup && (!person.availability || person.availability === 'available' || person.availability === 'home' || !!person.unavailableUntil && person.unavailableUntil <= localNow())
export function drivingIneligibility(person: Person): string | null {
  if (person.activeDriver === false) return 'אינו/ה נהג/ת פעיל/ה'
  if (person.age < 18) return 'מתחת לגיל 18'
  if (!person.hasLicense) return 'ללא רישיון נהיגה'
  if (!person.hasCar) return 'ללא גישה לרכב'
  if (!person.availableForPickup) return 'לא זמין/ה לאיסוף'
  if (person.availability && !['available', 'home'].includes(person.availability) && (!person.unavailableUntil || person.unavailableUntil > localNow())) return person.availability === 'work' ? 'בעבודה' : person.availability === 'travel' ? 'בנסיעה' : 'לא זמין/ה'
  return null
}

export function pickupIneligibility(person: Person, event: Pick<FamilyEvent, 'id' | 'familyId' | 'date' | 'time'> & Partial<Pick<FamilyEvent, 'departureTime' | 'routeMinutes'>>, data: AppData): string | null {
  const basicReason = drivingIneligibility({ ...person, availability: 'available' })
  if (basicReason) return basicReason
  if (person.availability && !['available', 'home'].includes(person.availability) && (!person.unavailableUntil || person.unavailableUntil > `${event.date}T${event.time}`)) return person.availability === 'work' ? 'בעבודה בזמן האירוע' : person.availability === 'travel' ? 'בנסיעה בזמן האירוע' : 'לא זמין/ה בזמן האירוע'
  const minutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute }
  const departure = event.departureTime ? minutes(event.departureTime) : minutes(event.time) - (event.routeMinutes || 20) - 10
  if (person.unavailableFrom && person.unavailableTo) {
    const blockedFrom = minutes(person.unavailableFrom)
    const blockedTo = minutes(person.unavailableTo)
    const blocked = blockedFrom <= blockedTo ? departure < blockedTo && minutes(event.time) >= blockedFrom : departure >= blockedFrom || minutes(event.time) < blockedTo
    if (blocked) return 'לא זמין/ה בשעות האלה בדרך כלל'
  }
  const busy = data.events.some(other => {
    if (other.id === event.id || other.familyId !== event.familyId || other.date !== event.date || other.responsibleId !== person.id && !other.participantIds.includes(person.id)) return false
    if (other.endTime || event.departureTime) {
      const otherStart = other.departureTime ? minutes(other.departureTime) : minutes(other.time)
      const otherEnd = other.endTime ? minutes(other.endTime) : minutes(other.time) + 25
      return departure < otherEnd + 10 && otherStart < minutes(event.time) + 20
    }
    return Math.abs(minutes(other.time) - minutes(event.time)) < 45
  })
  return busy ? 'אירוע אחר באותה שעה' : null
}

export function updatePersonAndRevalidate(data: AppData, familyId: string, person: Person): AppData {
  return {
    ...data,
    families: data.families.map(family => family.id === familyId ? { ...family, people: family.people.map(item => item.id === person.id ? person : item) } : family),
    events: data.events.map(event => event.familyId === familyId && event.requiresDriver && event.responsibleId === person.id && !!pickupIneligibility(person, event, data)
      ? { ...event, responsibleId: '', needsAttention: true, details: 'דרוש/ה נהג/ת כשיר/ה לאיסוף' }
      : event),
    tasks: data.tasks.map(task => task.familyId === familyId && task.ownerId === person.id && task.requiresAdult && person.age < 18
      ? { ...task, ownerId: '' }
      : task),
  }
}

export function saveEventAndDependents(data: AppData, event: FamilyEvent): AppData {
  const exists = data.events.some(item => item.id === event.id)
  return {
    ...data,
    events: exists ? data.events.map(item => item.id === event.id ? event : item) : [...data.events, event],
    tasks: exists ? data.tasks.map(task => task.eventId === event.id ? { ...task, due: event.date } : task) : data.tasks,
  }
}

export function removeEventAndDependents(data: AppData, eventId: string): AppData {
  return { ...data, events: data.events.filter(event => event.id !== eventId), tasks: data.tasks.filter(task => task.eventId !== eventId), transportationRequests: data.transportationRequests.filter(request => request.eventId !== eventId), integrationLogs: data.integrationLogs.filter(entry => entry.eventId !== eventId), calendarMirrors: data.calendarMirrors.filter(entry => entry.eventId !== eventId) }
}
const weekdayNames: Record<string, number> = { ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6 }

function nextWeekday(day: number) {
  const today = new Date().getDay()
  return localDate(((day - today + 7) % 7) || 7)
}

function departureTime(time: string, minutesBefore: number) {
  const [hour, minute] = time.split(':').map(Number)
  const total = (hour * 60 + minute - minutesBefore + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export type BirthdayPlan = {
  title: string
  date: string
  time: string
  child?: Person
  driver?: Person
  cakeOwner?: Person
  needsCake: boolean
  departure: string
  duplicate: boolean
}

export function prepareBirthdayPlan(data: AppData, family: FamilyUnit, actorId: string, input: string): BirthdayPlan {
  const child = family.people.find(person => input.includes(person.name) && !isAdult(person)) || family.people.find(person => !isAdult(person))
  const actor = family.people.find(person => person.id === actorId)
  const birthdayName = input.match(/יום הולדת\s+(?:אצל|ל|של)\s*([\p{L}]+)/u)?.[1] || 'דניאל'
  const title = `יום ההולדת של ${birthdayName}`
  const weekday = input.match(/(?:ביום\s+|יום\s+|ב)(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/)?.[1]
  const date = /מחר/.test(input) ? localDate(1) : weekday ? nextWeekday(weekdayNames[weekday]) : localDate(1)
  const timeMatch = input.match(/(?:בשעה|ב־)\s*(\d{1,2})(?::(\d{2}))?/)
  const hour = Number(timeMatch?.[1] || 17)
  const minute = Number(timeMatch?.[2] || 0)
  const time = `${String(Math.min(hour, 23)).padStart(2, '0')}:${String(Math.min(minute, 59)).padStart(2, '0')}`
  const driver = (actor && !pickupIneligibility(actor, { id: '', familyId: family.id, date, time }, data) ? actor : undefined) || family.people.find(person => !pickupIneligibility(person, { id: '', familyId: family.id, date, time }, data))
  const cakeOwner = (actor && isAdult(actor) ? actor : undefined) || driver || family.people.find(isAdult)
  const duplicate = data.events.some(event => event.familyId === family.id && event.title === title && event.date === date && event.time === time)
  return { title, date, time, child, driver, cakeOwner, needsCake: /עוגה|cake/i.test(input), departure: departureTime(time, 33), duplicate }
}

export function applyBirthdayPlan(data: AppData, family: FamilyUnit, actorId: string, plan: BirthdayPlan): AppData {
  if (plan.duplicate) return data
  const participantIds = [...new Set([plan.child?.id, actorId].filter((id): id is string => !!id))]
  const event: FamilyEvent = {
    id: uid(), familyId: family.id, title: plan.title, date: plan.date, time: plan.time, icon: '🎂', participantIds,
    responsibleId: '',
    details: plan.child ? 'בקשת הסעה תישלח לנהגים כשירים בתא המשפחתי' : 'אירוע משפחתי',
    needsAttention: !!plan.child, requiresDriver: !!plan.child,
  }
  const task: FamilyTask | undefined = plan.needsCake ? { id: uid(), familyId: family.id, title: 'לקנות עוגת יום הולדת', ownerId: plan.cakeOwner?.id || '', due: plan.date, done: false, eventId: event.id, requiresAdult: true } : undefined
  return {
    ...data,
    events: [...data.events, event],
    tasks: task ? [...data.tasks, task] : data.tasks,
    activity: [{ id: uid(), familyId: family.id, text: `${plan.title} נוסף לתוכנית`, personIds: participantIds }, ...data.activity],
  }
}

export type LateImpact = { pickup?: FamilyEvent; replacement?: Person; groceries: FamilyTask[]; dinner?: FamilyEvent; blocked: boolean; hasChanges: boolean }

export function getLateImpact(data: AppData, family: FamilyUnit, actorId: string): LateImpact {
  const pickup = data.events.find(event => event.familyId === family.id && event.date === localDate() && event.responsibleId === actorId && /אימון|איסוף|חוג|הסעה/.test(event.title))
  const replacement = family.people.find(person => person.id !== actorId && !!pickup && !pickupIneligibility(person, pickup, data))
  const groceries = data.tasks.filter(task => task.familyId === family.id && task.ownerId === actorId && task.due === localDate() && !task.done && /קני|סופר|מצרכ/.test(task.title))
  const dinner = data.events.find(event => event.familyId === family.id && event.date === localDate() && event.participantIds.includes(actorId) && /ארוחת ערב/.test(event.title))
  return { pickup, replacement, groceries, dinner, blocked: false, hasChanges: !!pickup || groceries.length > 0 || !!dinner }
}

export function applyLatePlan(data: AppData, family: FamilyUnit, actorId: string, impact: LateImpact): AppData {
  if (!impact.hasChanges || impact.blocked) return data
  const actor = family.people.find(person => person.id === actorId)
  const events = data.events.map(event => {
    if (event.id === impact.pickup?.id) return { ...event, responsibleId: '', participantIds: event.participantIds.filter(id => id !== actorId).length ? event.participantIds.filter(id => id !== actorId) : event.participantIds, needsAttention: true, issueReason: `${actor?.name || 'בן/בת משפחה'} מתעכב/ת בעבודה ולא יכול/ה לבצע את ההסעה שתוכננה`, details: 'בקשת הסעה ממתינה לתשובות' }
    if (event.id === impact.dinner?.id) return { ...event, details: `${actor?.name || 'בן/בת משפחה'} יגיע/תגיע כשעה מאוחר יותר` }
    return event
  })
  const groceryIds = new Set(impact.groceries.map(task => task.id))
  const tasks = data.tasks.map(task => groceryIds.has(task.id) ? { ...task, due: localDate(1) } : task)
  const [pickupHour, pickupMinute] = (impact.pickup?.time || '17:00').split(':').map(Number)
  const untilMinute = Math.min(23 * 60 + 59, pickupHour * 60 + pickupMinute + 60)
  const unavailableUntil = `${localDate()}T${String(Math.floor(untilMinute / 60)).padStart(2, '0')}:${String(untilMinute % 60).padStart(2, '0')}`
  const families = data.families.map(item => item.id === family.id ? { ...item, people: item.people.map(person => person.id === actorId ? { ...person, availability: 'work' as const, unavailableUntil } : person) } : item)
  const actions = [impact.pickup ? `נפתחה בקשת הסעה עבור ${impact.pickup.title}` : '', impact.groceries.length ? 'הקניות נדחו למחר' : '', impact.dinner ? 'שעת ההגעה לארוחה עודכנה' : ''].filter(Boolean)
  return { ...data, families, events, tasks, activity: [{ id: uid(), familyId: family.id, text: actions.join(' · '), personIds: [actorId] }, ...data.activity] }
}
