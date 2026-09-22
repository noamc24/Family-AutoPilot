import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ClipboardList, Home, Mic, MoreHorizontal, Pencil, Plus, Settings2, ShieldCheck, Sparkles, Trash2, Users, X } from 'lucide-react'
import { ageFromBirthDate, dateLabel, DEFAULT_FAMILY_ID, detectScenario, initialData, localDate, readData, removePersonAndTheirData, sanitizeAppData, uid, validBirthDate, type AppData, type FamilyEvent, type FamilyPreferences, type FamilyTask, type FamilyUnit, type PendingAction, type Person, type Priority, type RoutineKind, type WeeklyRoutine, type TransportationRequest } from './data'
import { applyBirthdayPlan, applyLatePlan, canDrive, drivingIneligibility, expandEventDates, getLateImpact, pickupIneligibility, prepareBirthdayPlan, removeEventAndDependents, saveEventAndDependents, updatePersonAndRevalidate } from './domain'
import { alternativeForRequest, applyAlternativePlan, applyTransitAlternative, confirmDriver, ensureRequests, rankedDrivers, reconcileTransportation, recommendDriver, requestForEvent, respondToRequest, transitAlternative } from './coordination'
import { detectIntegrationScenario, integrationNames, simulateIntegration, type IntegrationScenario } from './integrations'
import { advanceAutomaticScenarios, applyScheduleSolution, autopilotScenarios, runAutopilotScenario, scheduleConflicts, suggestScheduleSolution, type AutopilotScenario } from './autopilot'
import { advanceAutomaticExternalScenarios, externalScenarios, runExternalScenario, type ExternalScenarioId } from './integrationScenarios'
import { applyForecastSolution, scanFutureRisks, suggestForecastSolution, type ForecastRisk } from './forecast'
import { activityFeed } from './activityFeed'
import { upcomingBirthdays, type BirthdayReminder } from './birthdays'
import { closureIssues, materializeRoutineTasks, nextRepeatDate, routineAt, routineConflictingEvents, routineDays, sensitiveAutomaticChange, syncAcknowledgements } from './workflow'

type View = 'home' | 'events' | 'family' | 'tasks' | 'assistant' | 'more'
type Dialog = { type: 'event'; item?: FamilyEvent } | { type: 'task'; item?: FamilyTask } | { type: 'person'; item?: Person } | { type: 'family'; item?: FamilyUnit } | { type: 'plan'; scenario: 'birthday' | 'late' | 'reminder'; input: string } | { type: 'resolve'; item: FamilyEvent } | { type: 'alternative'; requestId: string } | { type: 'withdraw'; requestId: string } | { type: 'solution'; eventId: string; riskId?: string } | { type: 'unknown' } | null
const navigation = [
  { id: 'home', label: 'בית', icon: Home }, { id: 'events', label: 'יומן', icon: CalendarDays }, { id: 'family', label: 'משפחה', icon: Users },
  { id: 'tasks', label: 'משימות', icon: ClipboardList }, { id: 'assistant', label: 'עוזר', icon: Sparkles },
  { id: 'more', label: 'עוד', icon: MoreHorizontal },
] as const
const palette = ['peach', 'sage', 'lavender', 'butter']
function reminderTitle(input: string, recipient?: Person) {
  const text = input.replace(/^.*?תזכיר(?:י)?\s+/, '')
  const prefix = recipient ? `(?:לי|ל־?${recipient.name})` : 'לי'
  return text.replace(new RegExp(`^${prefix}\\s*`), '').trim() || 'תזכורת אישית'
}

function integrationDisplayText(value: string) { return value.replace(/\s*(?:המדומה|מדומה|מדומים|מדומות|בהדגמה)\s*/g, ' ').replace(/\s+/g, ' ').trim() }
function countLabel(count: number, one: string, many: string) { return `${count} ${count === 1 ? one : many}` }
function addedBy(person?: Person) { return person ? `${person.name} ${person.role === 'בת' || person.role === 'אם' ? 'הוסיפה' : 'הוסיף'}` : '' }
function App() {
  const [data, setData] = useState<AppData>(() => ensureRequests(readData(), 'maya'))
  const [familyId, setFamilyId] = useState(() => { const saved = localStorage.getItem('family-autopilot-family'); return saved === 'cohen' ? DEFAULT_FAMILY_ID : saved || DEFAULT_FAMILY_ID })
  const [personId, setPersonId] = useState(() => localStorage.getItem('family-autopilot-person') || 'adam')
  const [view, setView] = useState<View>('home')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [prompt, setPrompt] = useState('')
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmation, setConfirmation] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [familyMenu, setFamilyMenu] = useState(false)
  const [profileMenu, setProfileMenu] = useState(false)
  const [listScope, setListScope] = useState<'mine' | 'family'>('mine')
  const [form, setForm] = useState<Record<string, string>>({})
  const [participants, setParticipants] = useState<string[]>([])
  const [routines, setRoutines] = useState<WeeklyRoutine[]>([])
  const [today, setToday] = useState(localDate)
  const [responsibilities, setResponsibilities] = useState<Pick<FamilyTask, 'id' | 'title' | 'ownerId'>[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  const family = data.families.find(f => f.id === familyId) || data.families[0]
  const birthdayReminders = useMemo(() => upcomingBirthdays(family, today), [family, today])
  const currentPerson = family.people.find(p => p.id === personId) || family.people[0]
  const activePersonId = currentPerson?.id || ''
  const childMode = !!currentPerson && currentPerson.age < 18
  const autonomy = family.preferences?.autonomy || 'autopilot'
  const canEditEvents = !!currentPerson && currentPerson.age >= 18 && (currentPerson.role === 'אב' || currentPerson.role === 'אם')
  const personName = (id: string) => family.people.find(p => p.id === id)?.name || 'ללא שיוך'
  const eventPeople = (event: FamilyEvent) => [...new Set([...event.participantIds, event.responsibleId].filter(Boolean))].map(personName).join(' · ')
  const relevant = (item: FamilyEvent) => item.participantIds.includes(activePersonId) || item.responsibleId === activePersonId
  const familyEvents = useMemo(() => data.events.filter(e => e.familyId === family.id).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)), [data.events, family.id])
  const myEvents = familyEvents.filter(relevant)
  const myTasks = data.tasks.filter(t => t.familyId === family.id && t.ownerId === activePersonId)
  const familyTasks = data.tasks.filter(t => t.familyId === family.id)
  const todayEvents = myEvents.filter(e => e.date === localDate())
  const upcoming = myEvents.filter(e => e.date > localDate()).slice(0, 5)
  const requests = data.transportationRequests.filter(r => r.familyId === family.id && r.status !== 'CANCELLED')
  const actionableRequests = requests.filter(r => r.eligibleMemberIds.includes(activePersonId) && r.responses[activePersonId] === 'PENDING')
  const unresolvedRequests = requests.filter(r => r.status === 'UNRESOLVED' && (!!currentPerson && currentPerson.age >= 18 || r.passengerId === activePersonId))
  const attention = familyEvents.filter(e => e.needsAttention && !e.responsibleId && !requestForEvent(data, e.id) && (relevant(e) || !!currentPerson && currentPerson.age >= 18))
  const attentionTasks = familyTasks.filter(task => !task.done && !task.ownerId && !!currentPerson && currentPerson.age >= 18)
  const conflictedEvents = familyEvents.filter(event => !!event.createdById && scheduleConflicts(data, event).length > 0)
  const futureRisks = useMemo(() => scanFutureRisks(data, family.id), [data, family.id])
  const attentionCount = attention.length + attentionTasks.length + actionableRequests.length + unresolvedRequests.length + conflictedEvents.filter(event => !requestForEvent(data, event.id)).length + futureRisks.length
  const familyOpenRequests = requests.filter(request => request.status !== 'COVERED' && (data.events.find(event => event.id === request.eventId)?.date || '') >= localDate())
  const openIssues = closureIssues(data, family.id)
  const familyDecisionCount = openIssues.length
  const familyRidesWithoutDriver = familyEvents.filter(event => event.requiresDriver && !event.responsibleId && event.date >= localDate()).length
  const familyConflicts = futureRisks.filter(risk => risk.kind === 'overlap' || risk.kind === 'double-ride').length
  const familyTodayEvents = familyEvents.filter(event => event.date === localDate()).length
  const statusDetails = familyDecisionCount ? openIssues.slice(0, 2).join(' · ') + (openIssues.length > 2 ? ` · ועוד ${openIssues.length - 2} לטיפול` : '') : `${countLabel(familyTodayEvents, 'אירוע היום', 'אירועים היום')} · אין נושאים פתוחים`
  const lateImpact = getLateImpact(data, family, activePersonId)

  useEffect(() => {
    const clean = syncAcknowledgements(materializeRoutineTasks(ensureRequests(sanitizeAppData(data), activePersonId)))
    if (JSON.stringify(clean) !== JSON.stringify(data)) setData(clean)
    else localStorage.setItem('family-autopilot-he-v1', JSON.stringify(data))
  }, [data])
  useEffect(() => { localStorage.setItem('family-autopilot-family', family.id); localStorage.setItem('family-autopilot-person', activePersonId) }, [family.id, activePersonId])
  useEffect(() => { const interval = window.setInterval(() => { setToday(localDate()); setData(previous => { const next = sanitizeAppData(materializeRoutineTasks(previous)); return JSON.stringify(next) === JSON.stringify(previous) ? previous : next }) }, 60_000); return () => window.clearInterval(interval) }, [])
  useEffect(() => { if (toast) { const timeout = window.setTimeout(() => setToast(''), 20_000); return () => clearTimeout(timeout) } }, [toast])
  useEffect(() => {
    const unseen = birthdayReminders.filter(({ person, date }) => !localStorage.getItem(`family-autopilot-birthday-reminder-${family.id}-${person.id}-${date}`))
    if (!unseen.length) return
    unseen.forEach(({ person, date }) => localStorage.setItem(`family-autopilot-birthday-reminder-${family.id}-${person.id}-${date}`, '1'))
    setToast(unseen.length === 1 ? `יום ההולדת של ${unseen[0].person.name} ${unseen[0].daysUntil ? `בעוד ${unseen[0].daysUntil} ימים` : 'היום'} 🎂` : `ימי הולדת מתקרבים: ${unseen.map(item => item.person.name).join(' · ')} 🎂`)
  }, [birthdayReminders, family.id])
  useEffect(() => {
    if (autonomy === 'conservative') return
    const actorId = family.people.find(person => person.age >= 18)?.id || activePersonId
    if (!actorId) return
    const storageKey = `family-autopilot-auto-${family.id}`
    const randomInterval = () => 90_000 + Math.floor(Math.random() * 90_000)
    let timeoutId: number | undefined
    const scheduleNext = () => {
      const delay = randomInterval()
      timeoutId = window.setTimeout(() => {
        check()
        scheduleNext()
      }, delay)
    }
    const check = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - Number(localStorage.getItem(storageKey) || 0) < 90_000) return
      if (autonomy === 'balanced') {
        const taskRisk = scanFutureRisks(dataRef.current, family.id).find(risk => risk.kind === 'task' && !!suggestForecastSolution(dataRef.current, risk))
        if (taskRisk) {
          const next = applyForecastSolution(dataRef.current, taskRisk)
          if (next !== dataRef.current) {
            localStorage.setItem(storageKey, String(now))
            dataRef.current = next
            setData(next)
            setToast('משימה גמישה הועברה למועד פנוי לפי רמת הפעולה הרגילה')
            return
          }
        }
      }
      const excluded = [...(dataRef.current.dismissedActionIds || []), ...(dataRef.current.pendingActions || []).map(action => action.id)]
      const result = autonomy === 'balanced' ? excluded.includes(`external:${family.id}:location-near`) ? { data: dataRef.current, message: '', applied: false } : runExternalScenario(dataRef.current, family.id, actorId, 'location-near', 'automatic') : advanceAutomaticExternalScenarios(dataRef.current, family.id, actorId, excluded)
      if (!result.applied) return
      if (sensitiveAutomaticChange(dataRef.current, result.data, family.id)) {
        const scenarioId = 'scenarioId' in result ? result.scenarioId : 'location-near'
        const action: PendingAction = { id: `external:${family.id}:${scenarioId}`, familyId: family.id, source: 'external', scenarioId: String(scenarioId), message: result.message, createdAt: new Date().toISOString() }
        const next = { ...dataRef.current, pendingActions: [...(dataRef.current.pendingActions || []), action] }
        dataRef.current = next; setData(next); setToast('שינוי רגיש ממתין לאישור במרכז הטיפול')
        return
      }
      localStorage.setItem(storageKey, String(now))
      dataRef.current = result.data
      setData(result.data)
      setToast(result.message)
    }
    const initial = window.setTimeout(() => { check(); scheduleNext() }, 15_000)
    scheduleNext()
    return () => { window.clearTimeout(initial); if (timeoutId) window.clearTimeout(timeoutId) }
  }, [family.id, family.people, activePersonId, autonomy])
  useEffect(() => {
    if (autonomy !== 'autopilot') return
    if (!family.people.some(person => person.age < 18)) return
    const randomInterval = () => 90_000 + Math.floor(Math.random() * 90_000)
    let timeoutId: number | undefined
    const scheduleNext = () => {
      const delay = randomInterval()
      timeoutId = window.setTimeout(() => {
        check()
        scheduleNext()
      }, delay)
    }
    const check = () => {
      if (document.visibilityState !== 'visible') return
      const excluded = [...(dataRef.current.dismissedActionIds || []), ...(dataRef.current.pendingActions || []).map(action => action.id)]
      const result = advanceAutomaticScenarios(dataRef.current, family.id, excluded)
      if (!result.applied) return
      if (sensitiveAutomaticChange(dataRef.current, result.data, family.id) && result.scenarioId) {
        const action: PendingAction = { id: `scenario:${family.id}:${result.scenarioId}`, familyId: family.id, source: 'scenario', scenarioId: result.scenarioId, message: result.message, createdAt: new Date().toISOString() }
        const next = { ...dataRef.current, pendingActions: [...(dataRef.current.pendingActions || []), action] }
        dataRef.current = next; setData(next); setToast('שינוי רגיש ממתין לאישור במרכז הטיפול')
        return
      }
      dataRef.current = result.data
      setData(result.data)
      setToast(result.message)
    }
    const initial = window.setTimeout(() => { check(); scheduleNext() }, 25_000)
    scheduleNext()
    return () => { window.clearTimeout(initial); if (timeoutId) window.clearTimeout(timeoutId) }
  }, [family.id, family.people, autonomy])

  function askConfirmation(message: string, onConfirm: () => void) { setConfirmation({ message, onConfirm }) }
  function runFamilyScenario(scenario: AutopilotScenario) {
    const result = runAutopilotScenario(dataRef.current, family.id, scenario)
    if (result.applied) { dataRef.current = result.data; setData(result.data) }
    setToast(result.message)
    if (result.applied) setView('home')
  }
  function runExternalSource(scenario: ExternalScenarioId) {
    if (childMode) { setToast('בדיקת מקורות זמינה למבוגרים'); return }
    const result = runExternalScenario(dataRef.current, family.id, activePersonId, scenario)
    if (result.applied) { dataRef.current = result.data; setData(result.data); setView('home') }
    setToast(result.message)
  }
  function confirmFutureSolution(riskId: string) {
    if (!canEditEvents) { setToast('שינוי התוכנית זמין להורים'); setDialog(null); return }
    const risk = futureRisks.find(item => item.id === riskId)
    if (!risk) return
    const next = applyForecastSolution(data, risk)
    if (next === data) { setToast('לא נמצא כרגע פתרון מתאים'); return }
    setData(next); setDialog(null); setToast('הפתרון אושר והתוכנית המשפחתית עודכנה')
  }
  function confirmSolution(eventId: string) {
    if (!canEditEvents) { setToast('שינוי מועד אירוע זמין להורים'); setDialog(null); return }
    const event = data.events.find(item => item.id === eventId)
    if (!event) return
    const next = applyScheduleSolution(data, eventId)
    if (next === data) { setToast('לא נמצא מועד פנוי לאירוע הזה'); return }
    setData(next); setDialog(null); setToast(`${event.title} הועבר למועד פנוי. בקשת ההסעה עודכנה.`)
  }

  function log(text: string, personIds: string[] = []) { return { id: uid(), familyId: family.id, text, personIds, createdAt: new Date().toISOString() } }
  function answerRide(id: string, answer: 'CAN_DO' | 'CANNOT_DO') {
    setData(previous => {
      const next = respondToRequest(previous, id, activePersonId, answer)
      if (next === previous) return previous
      const event = previous.events.find(item => item.id === previous.transportationRequests.find(item => item.id === id)?.eventId)
      return { ...next, activity: [log(`${currentPerson?.name} השיב/ה ${answer === 'CAN_DO' ? 'יכול/ה' : 'לא יכול/ה'} להסעה: ${event?.title || 'אירוע'}`, [activePersonId, ...(event?.participantIds || [])]), ...next.activity] }
    })
  }
  function approveRide(id: string, driverId: string) {
    setData(previous => {
      const next = confirmDriver(previous, id, driverId)
      if (next === previous) return previous
      const event = previous.events.find(item => item.id === previous.transportationRequests.find(item => item.id === id)?.eventId)
      return { ...next, activity: [log(`${personName(driverId)} אחראי/ת להסעה: ${event?.title || 'אירוע'}`, [driverId, ...(event?.participantIds || [])]), ...next.activity] }
    })
  }
  function approveTransit(requestId: string) {
    setData(previous => applyTransitAlternative(previous, requestId))
    setToast('בקשת ההסעה נסגרה. האירוע עודכן להגעה בתחבורה ציבורית')
  }
  function approveAlternative(requestId: string) {
    const request = data.transportationRequests.find(item => item.id === requestId)
    const event = data.events.find(item => item.id === request?.eventId)
    setData(previous => {
      const next = applyAlternativePlan(previous, requestId)
      return next === previous ? previous : { ...next, activity: [log(`נבדקה חלופה להסעה: ${event?.title || 'אירוע'}. ממתינים לתשובות חדשות.`, [request?.passengerId || '', ...((request?.eligibleMemberIds) || [])].filter(Boolean)), ...next.activity] }
    })
    setDialog(null)
    setToast('התוכנית עודכנה. נדרשת תשובה חדשה לפני שיבוץ נהג/ת.')
  }
  function changeFamily(id: string) {
    const next = data.families.find(f => f.id === id)
    if (!next) return
    setFamilyId(id); setPersonId(next.people[0]?.id || ''); setFamilyMenu(false); setProfileMenu(false); setView('home')
  }
  function updateFamilyPreferences(changes: FamilyPreferences) {
    setData(previous => ({ ...previous, families: previous.families.map(item => item.id === family.id ? { ...item, preferences: { ...item.preferences, ...changes } } : item) }))
  }
  function updatePersonPreferences(id: string, changes: Partial<Person>) {
    setData(previous => {
      const member = previous.families.find(item => item.id === family.id)?.people.find(person => person.id === id)
      return member ? ensureRequests(updatePersonAndRevalidate(previous, family.id, { ...member, ...changes }), activePersonId) : previous
    })
  }
  function suggestResponsibilityOwner() {
    const date = form.date || localDate()
    const time = form.time || '17:00'
    return family.people.filter(person => person.age >= 18 && !routineAt(person, date, time, form.endTime || time)).sort((a, b) => data.tasks.filter(task => task.ownerId === a.id && task.due === date).length - data.tasks.filter(task => task.ownerId === b.id && task.due === date).length)[0]?.id || ''
  }
  function openEvent(item?: FamilyEvent) {
    if (item && !canEditEvents) { setToast('עריכת אירועים זמינה להורים'); return }
    if (!activePersonId) { setToast('בחרו בן משפחה כדי להוסיף אירוע'); return }
    setForm(item ? { title: item.title, date: item.date, endDate: item.endDate || item.date, time: item.time, endTime: item.endTime || '', icon: item.icon, responsibleId: item.responsibleId, passengerId: requestForEvent(data, item.id)?.passengerId || item.participantIds[0] || '', details: item.details, requiresDriver: item.requiresDriver ? 'true' : 'false', priority: item.priority || 'normal', preferredDriverId: item.preferredDriverId || '', transitAvailable: String(!!item.transitAvailable), routineOverride: String(!!item.routineOverride) } : { title: '', date: localDate(), endDate: localDate(), time: '17:00', endTime: '', icon: '📅', responsibleId: '', passengerId: family.people.find(person => person.age < 18)?.id || activePersonId, details: '', requiresDriver: 'false', priority: 'normal', preferredDriverId: '', transitAvailable: 'false', routineOverride: 'false' })
    setParticipants(item?.participantIds || (activePersonId ? [activePersonId] : []))
    setResponsibilities(data.tasks.filter(task => task.eventId === item?.id && task.responsibility).map(task => ({ id: task.id, title: task.title, ownerId: task.ownerId })))
    setDialog({ type: 'event', item })
  }
  function openTask(item?: FamilyTask) { if (childMode) { setToast('עריכת משימות זמינה בתצוגת מבוגר'); return }; setForm(item ? { title: item.title, due: item.due, ownerId: item.ownerId, requiresAdult: item.requiresAdult ? 'true' : 'false', priority: item.priority || 'normal', flexible: String(item.flexible !== false), repeatDays: (item.repeatDays || []).join(',') } : { title: '', due: localDate(), ownerId: activePersonId, requiresAdult: 'false', priority: 'normal', flexible: 'true', repeatDays: '' }); setDialog({ type: 'task', item }) }
  function openPerson(item?: Person) { setRoutines(item?.routines || []); if (childMode) { setToast('ניהול המשפחה זמין בתצוגת מבוגר'); return }; setForm(item ? { name: item.name, role: item.role, color: item.color, age: String(item.age), birthDate: item.birthDate || '', hasLicense: String(item.hasLicense), hasCar: String(item.hasCar), availableForPickup: String(item.availableForPickup), availability: item.availability || 'available', unavailableUntil: item.unavailableUntil || '' } : { name: '', role: 'בן', color: palette[family.people.length % palette.length], age: '', birthDate: '', hasLicense: 'false', hasCar: 'false', availableForPickup: 'false', availability: 'available', unavailableUntil: '' }); setDialog({ type: 'person', item }) }
  function openFamily(item?: FamilyUnit) { if (childMode) { setToast('ניהול המשפחה זמין בתצוגת מבוגר'); return }; setForm({ name: item?.name || '' }); setDialog({ type: 'family', item }) }
  function updateForm(key: string, value: string) { setForm(previous => ({ ...previous, [key]: value, ...(key === 'birthDate' && validBirthDate(value) ? { age: String(ageFromBirthDate(value)) } : {}) })) }

  function saveForm(confirmed = false) {
    if (!dialog) return
    if (dialog.type === 'event' ? !!dialog.item && !canEditEvents : childMode) { setDialog(null); return }
    if (dialog.type === 'event') {
       if (!form.title?.trim() || !form.date || !form.time || (!participants.length && form.requiresDriver !== 'true')) return
       const requiresDriver = form.requiresDriver === 'true'
       if (requiresDriver && !family.people.some(person => person.id === form.passengerId)) { setToast('בחרו מי צריך/ה הסעה'); return }
       const previousRequest = dialog.item && requestForEvent(data, dialog.item.id)
       const changedNeed = !!previousRequest && (dialog.item?.date !== form.date || dialog.item?.time !== form.time || previousRequest.passengerId !== form.passengerId)
       if (changedNeed && !confirmed) { askConfirmation('שינוי פרטי ההסעה יבטל את השיבוץ והתשובות הקודמות. הבקשה תיפתח מחדש לנהגים כשירים. להמשיך?', () => saveForm(true)); return }
       const baseEvent: FamilyEvent = { id: dialog.item?.id || uid(), familyId: family.id, title: form.title.trim(), date: form.date, time: form.time, endDate: form.endDate && form.endDate > form.date ? form.endDate : undefined, endTime: form.endTime || undefined, icon: form.icon || '📅', participantIds: requiresDriver ? [form.passengerId, ...participants.filter(id => id !== form.passengerId)] : participants, responsibleId: requiresDriver ? (dialog.item?.responsibleId || '') : form.responsibleId || '', details: form.details?.trim() || '', requiresDriver, needsAttention: requiresDriver && !dialog.item?.responsibleId, createdById: dialog.item?.createdById || activePersonId, sourceNote: dialog.item?.sourceNote, priority: form.priority as Priority, preferredDriverId: form.preferredDriverId || undefined, transitAvailable: form.transitAvailable === 'true', routineOverride: form.routineOverride === 'true' }
       const generated = baseEvent.endDate ? expandEventDates(baseEvent) : [baseEvent]
       setData(previous => {
         let next = previous
         for (const event of generated) {
           next = saveEventAndDependents(next, event)
         }
         const primary = generated[0]
         const transportationRequests = changedNeed && primary.requiresDriver ? next.transportationRequests.map(request => request.eventId === primary.id ? { ...request, selectedDriverId: '', status: 'OPEN' as const, responses: Object.fromEntries(request.eligibleMemberIds.map(id => [id, 'PENDING' as const])) } : request) : next.transportationRequests
         const tasks = [...next.tasks.filter(task => !generated.some(event => event.id === task.eventId) || !task.responsibility), ...responsibilities.filter(item => item.title.trim()).map(item => ({ id: item.id, familyId: family.id, title: item.title.trim(), ownerId: item.ownerId, due: primary.date, done: next.tasks.find(task => task.id === item.id)?.done || false, eventId: primary.id, responsibility: true, priority: 'high' as const }))]
         return ensureRequests({ ...next, tasks, transportationRequests, events: changedNeed && primary.requiresDriver ? next.events.map(item => item.id === primary.id ? { ...item, responsibleId: '', needsAttention: true } : item) : next.events, activity: [log(`${dialog.item ? 'עודכן' : 'נוסף'} אירוע: ${primary.title}`, [activePersonId]), ...next.activity] }, activePersonId)
       })
      setToast(dialog.item ? 'האירוע עודכן' : 'האירוע נוסף ללוח')
    } else if (dialog.type === 'task') {
      if (!form.title?.trim() || !form.due) return
      const owner = family.people.find(person => person.id === form.ownerId)
      if (form.requiresAdult === 'true' && owner && owner.age < 18) { setToast('המשימה הזו חייבת להיות משויכת למבוגר'); return }
      const repeatDays = (form.repeatDays || '').split(',').filter(Boolean).map(Number)
      const task: FamilyTask = { repeatDays, id: dialog.item?.id || uid(), familyId: family.id, title: form.title.trim(), ownerId: form.ownerId || '', due: form.due, done: dialog.item?.done || false, eventId: dialog.item?.eventId, routineId: dialog.item?.routineId, responsibility: dialog.item?.responsibility, requiresAdult: form.requiresAdult === 'true', priority: form.priority as Priority, flexible: form.flexible === 'true' }
      setData(previous => ({ ...previous, tasks: dialog.item ? previous.tasks.map(t => t.id === task.id ? task : t) : [...previous.tasks, task] }))
      setToast(dialog.item ? 'המשימה עודכנה' : 'המשימה נוספה')
    } else if (dialog.type === 'person') {
      const birthDate = form.birthDate || undefined
      const birthYear = birthDate ? Number(birthDate.slice(0, 4)) : dialog.item?.birthYear
      const age = birthDate ? ageFromBirthDate(birthDate) : dialog.item?.age ?? NaN
      const routineDaysSelected = routines.map(routine => {
        const selected = Array.isArray(routine.days) && routine.days.length ? [...new Set(routine.days.filter(day => day >= 0 && day < 7))] : Number.isInteger(routine.day) && routine.day >= 0 && routine.day < 7 ? [routine.day] : []
        return { ...routine, days: selected, day: selected[0] ?? -1 }
      })
      if (routineDaysSelected.some(routine => !routine.label.trim() || !routine.days.length || !routine.start || !routine.end || routine.start >= routine.end)) { setToast('יש להשלים ימים ושעות לכל פריט בלו״ז הקבוע'); return }
      if (!birthDate && !dialog.item) { setToast('יש להזין תאריך לידה מלא'); return }
      if (birthDate && !validBirthDate(birthDate)) { setToast('תאריך הלידה אינו תקין'); return }
      if (!form.name?.trim() || !Number.isInteger(age) || age < 0 || age > 120) return
      const adult = age >= 18
       const person: Person = { id: dialog.item?.id || uid(), name: form.name.trim(), role: (['אב', 'אם', 'בן', 'בת'].includes(form.role) ? form.role : 'בן') as Person['role'], color: form.color || 'sage', age, birthYear, birthDate, hasLicense: adult && form.hasLicense === 'true', hasCar: adult && form.hasCar === 'true', availableForPickup: adult && form.availableForPickup === 'true', availability: (form.availability || 'available') as Person['availability'], unavailableUntil: form.unavailableUntil || '', travelMinutes: dialog.item?.travelMinutes, activeDriver: dialog.item?.activeDriver, unavailableFrom: dialog.item?.unavailableFrom, unavailableTo: dialog.item?.unavailableTo, preferredMaxRides: dialog.item?.preferredMaxRides, lastResortDriver: dialog.item?.lastResortDriver, canUseTransit: dialog.item?.canUseTransit, canTravelAlone: dialog.item?.canTravelAlone, routines: routineDaysSelected }
       if (dialog.item) {
         const affected = data.events.filter(event => event.familyId === family.id && event.requiresDriver && event.responsibleId === person.id && !!pickupIneligibility(person, event, data))
         const pending = data.transportationRequests.filter(request => request.familyId === family.id && request.eligibleMemberIds.includes(person.id) && request.responses[person.id] === 'PENDING').length
         if ((affected.length || pending) && !confirmed) { askConfirmation(`השינוי ישפיע על ${affected.length} הסעות משובצות ועל ${pending} בקשות פתוחות. ${affected.length ? 'ההסעות ייפתחו מחדש למשפחה. ' : ''}להמשיך?`, () => saveForm(true)); return }
       }
       setData(previous => reconcileTransportation(dialog.item ? updatePersonAndRevalidate(previous, family.id, person) : { ...previous, families: previous.families.map(f => f.id === family.id ? { ...f, people: [...f.people, person] } : f) }))
      if (!activePersonId) setPersonId(person.id)
      setToast(dialog.item ? 'פרטי בן המשפחה עודכנו' : 'בן המשפחה נוסף')
    } else if (dialog.type === 'family') {
      if (!form.name?.trim()) return
      if (dialog.item) setData(previous => ({ ...previous, families: previous.families.map(f => f.id === dialog.item!.id ? { ...f, name: form.name.trim() } : f) }))
      else { const id = uid(); setData(previous => ({ ...previous, families: [...previous.families, { id, name: form.name.trim(), people: [] }] })); setFamilyId(id); setPersonId(''); setView('family') }
      setToast(dialog.item ? 'שם התא המשפחתי עודכן' : 'התא המשפחתי נוסף')
    }
    setDialog(null)
  }

  function removeEvent(item: FamilyEvent) {
    if (!canEditEvents) { setToast('מחיקת אירועים זמינה להורים'); return }
    const linkedTasks = data.tasks.filter(task => task.eventId === item.id).length
    askConfirmation(`למחוק את האירוע "${item.title}"${linkedTasks ? ` ואת ${linkedTasks} המשימות שנוצרו בעקבותיו` : ''}?`, () => { setData(previous => { const next = removeEventAndDependents(previous, item.id); return { ...next, activity: [log(`${currentPerson?.name || 'בן משפחה'} ביטל/ה את האירוע: ${item.title}`, [activePersonId]), ...next.activity] } }); setDialog(null); setToast('האירוע והמשימות התלויות בו נמחקו') })
  }
  function removeTask(item: FamilyTask) {
    askConfirmation(`למחוק את המשימה "${item.title}"?`, () => { setData(previous => ({ ...previous, tasks: previous.tasks.filter(t => t.id !== item.id), suppressedRoutineTaskIds: item.routineId ? [...new Set([...(previous.suppressedRoutineTaskIds || []), item.id])] : previous.suppressedRoutineTaskIds })); setDialog(null); setToast('המשימה נמחקה') })
  }
  function removePerson(item: Person) {
    const removedEvents = data.events.filter(event => event.familyId === family.id && (event.responsibleId === item.id || event.participantIds.includes(item.id) || event.createdById === item.id))
    const eventCount = removedEvents.length
    const removedIds = new Set(removedEvents.map(event => event.id))
    const taskCount = data.tasks.filter(task => task.familyId === family.id && (task.ownerId === item.id || removedIds.has(task.eventId || ''))).length
    askConfirmation(`להסיר את ${item.name}? יחד איתו/ה יימחקו ${eventCount} אירועים (גם משותפים) ו־${taskCount} משימות המשויכים אליו/ה.`, () => {
      setData(previous => removePersonAndTheirData(previous, family.id, item.id))
      if (activePersonId === item.id) setPersonId(family.people.find(p => p.id !== item.id)?.id || '')
      setDialog(null); setToast('בן המשפחה והפריטים המשויכים אליו/ה הוסרו')
    })
  }
  function removeFamily(item: FamilyUnit) {
    if (data.families.length === 1) { setToast('צריך להשאיר לפחות תא משפחתי אחד'); return }
    askConfirmation(`למחוק את "${item.name}" ואת כל האירועים והמשימות שלו?`, () => {
      const next = data.families.find(f => f.id !== item.id)!
      setData(previous => ({ ...previous, families: previous.families.filter(f => f.id !== item.id), events: previous.events.filter(e => e.familyId !== item.id), tasks: previous.tasks.filter(t => t.familyId !== item.id), activity: previous.activity.filter(a => a.familyId !== item.id), transportationRequests: previous.transportationRequests.filter(r => r.familyId !== item.id), integrationLogs: previous.integrationLogs.filter(entry => entry.familyId !== item.id), calendarMirrors: previous.calendarMirrors.filter(entry => entry.familyId !== item.id), acknowledgements: (previous.acknowledgements || []).filter(entry => !previous.events.some(event => event.id === entry.eventId && event.familyId === item.id)), pendingActions: (previous.pendingActions || []).filter(action => action.familyId !== item.id), dismissedActionIds: (previous.dismissedActionIds || []).filter(id => !id.includes(`:${item.id}:`)) }))
      setFamilyId(next.id); setPersonId(next.people[0]?.id || ''); setDialog(null); setView('home'); setToast('התא המשפחתי נמחק')
    })
  }
  function toggleTask(item: FamilyTask) { setData(previous => ({ ...previous, tasks: previous.tasks.map(t => t.id === item.id ? t.repeatDays?.length && !t.done ? { ...t, due: nextRepeatDate(t.due, t.repeatDays), done: false } : { ...t, done: !t.done } : t) })) }
  function updateAcknowledgement(eventId: string, status: 'seen' | 'approved' | 'declined') {
    setData(previous => ({ ...previous, acknowledgements: (previous.acknowledgements || []).map(item => item.eventId === eventId && item.personId === activePersonId ? { ...item, status, updatedAt: new Date().toISOString() } : item) }))
    setToast(status === 'approved' ? 'השינוי אושר' : status === 'seen' ? 'סומן כנקרא' : 'התגובה נשמרה; השינוי עדיין דורש טיפול')
  }
  function handleExternalUpdate(id: string) {
    if (childMode) { setToast('טיפול בעדכונים חיצוניים זמין למבוגרים'); return }
    setData(previous => ({ ...previous, integrationLogs: previous.integrationLogs.map(item => item.id === id ? { ...item, handledAt: new Date().toISOString() } : item) }))
    setToast('העדכון סומן כטופל')
  }
  function approveRoutineException(eventId: string) {
    if (!canEditEvents) { setToast('אישור חריגה מהלו״ז זמין להורים'); return }
    setData(previous => ({ ...previous, events: previous.events.map(item => item.id === eventId ? { ...item, routineOverride: true } : item) }))
    setToast('החריגה מהלו״ז הקבוע אושרה לאירוע הזה')
  }
  function reviewPendingAction(action: PendingAction, approved: boolean) {
    if (childMode) { setToast('אישור פעולות רגישות זמין למבוגרים'); return }
    if (!approved) {
      setData(previous => ({ ...previous, pendingActions: (previous.pendingActions || []).filter(item => item.id !== action.id), dismissedActionIds: [...new Set([...(previous.dismissedActionIds || []), action.id])] }))
      setToast('הפעולה האוטומטית נדחתה')
      return
    }
    const result = action.source === 'external' ? runExternalScenario(dataRef.current, family.id, activePersonId, action.scenarioId as ExternalScenarioId) : runAutopilotScenario(dataRef.current, family.id, action.scenarioId as AutopilotScenario)
    const next = { ...(result.applied ? result.data : dataRef.current), pendingActions: (dataRef.current.pendingActions || []).filter(item => item.id !== action.id) }
    dataRef.current = next; setData(next)
    setToast(result.applied ? 'הפעולה אושרה והתוכנית עודכנה' : 'הפעולה כבר אינה מתאימה לתוכנית הנוכחית')
  }
  function runSimulatedSource(source: IntegrationScenario) {
    if (childMode) { setToast('בדיקת מקורות זמינה למבוגרים'); return }
    const result = simulateIntegration(data, family.id, activePersonId, source)
    if (result.applied) setData(result.data)
    setToast(result.message)
    setView('home')
  }
  function sendPrompt(value = prompt) {
    if (!value.trim() || processing) return
    const external = detectIntegrationScenario(value)
    if (external) {
      setPrompt(''); setProcessing(true)
      window.setTimeout(() => { setProcessing(false); runSimulatedSource(external) }, 650)
      return
    }
    const scenario = detectScenario(value)
    setPrompt(''); setProcessing(true)
    window.setTimeout(() => { setProcessing(false); setDialog(scenario === 'unknown' ? { type: 'unknown' } : { type: 'plan', scenario, input: value }) }, 850)
  }
  function example(value: string) { setView('home'); setPrompt(value); window.setTimeout(() => inputRef.current?.focus(), 30) }
  function confirmPlan(planDialog: Extract<NonNullable<Dialog>, { type: 'plan' }>) {
    if (planDialog.scenario === 'reminder') {
      const recipient = family.people.find(person => planDialog.input.includes(`ל${person.name}`) || planDialog.input.includes(`ל־${person.name}`)) || currentPerson
      if (!recipient) return
      const title = reminderTitle(planDialog.input, recipient)
      const due = /מחר/.test(planDialog.input) ? localDate(1) : localDate()
      setData(previous => ({ ...previous, tasks: [...previous.tasks, { id: uid(), familyId: family.id, title, ownerId: recipient.id, due, done: false }], activity: [log(`נוספה תזכורת ל${recipient.name}: ${title}`, [recipient.id]), ...previous.activity] }))
      setToast(`התזכורת נוספה ל${recipient.name}`)
    } else if (planDialog.scenario === 'birthday') {
      const plan = prepareBirthdayPlan(data, family, activePersonId, planDialog.input)
      if (plan.duplicate || !activePersonId) return
      setData(previous => ensureRequests(applyBirthdayPlan(previous, family, activePersonId, plan), activePersonId))
      setToast('תוכנית יום ההולדת נוספה ללוח')
    } else {
      const impact = getLateImpact(data, family, activePersonId)
      if (!impact.hasChanges || impact.blocked) return
       setData(previous => ensureRequests(applyLatePlan(previous, family, activePersonId, impact), activePersonId))
      setToast('התוכנית המשפחתית עודכנה לפי השינוי')
    }
    setDialog(null); setView('home')
  }
  function resolve(item: FamilyEvent) {
    if (!form.responsibleId) return
    const responsible = family.people.find(person => person.id === form.responsibleId)
    if (!responsible || (item.requiresDriver && pickupIneligibility(responsible, item, data))) { setToast('יש לבחור נהג/ת פנוי/ה עם רישיון ורכב'); return }
    const name = personName(form.responsibleId)
    setData(previous => ({ ...previous, events: previous.events.map(e => e.id === item.id ? { ...e, responsibleId: form.responsibleId, participantIds: [...new Set([...e.participantIds, form.responsibleId])], needsAttention: false, details: `${name} אחראי/ת לאיסוף` } : e), activity: [log(`${name} קיבל/ה אחריות על ${item.title}`, [form.responsibleId, ...item.participantIds]), ...previous.activity] }))
    setDialog(null); setToast('האיסוף מכוסה כעת')
  }

  const inputArea = <section className="ask-card"><div className="ask-title"><span className="spark-icon"><Sparkles size={19}/></span><div><h2>מה קורה אצלכם?</h2><p>ספרו לי מה השתנה, ואני אדאג לפרטים.</p></div></div><div className="input-wrap"><textarea ref={inputRef} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt() } }} placeholder="אפשר לספר לי כל דבר..." aria-label="עדכון למשפחה"/><button className="mic" title="הקלטה קולית אינה זמינה" onClick={() => setToast('אפשר להקליד את העדכון. הקלטה קולית אינה זמינה כרגע.')} aria-label="הקלטה קולית אינה זמינה"><Mic size={18}/></button><button className="submit" disabled={!prompt.trim() || processing} onClick={() => sendPrompt()} aria-label="שליחת עדכון"><ArrowLeft size={18}/></button></div><div className="examples"><span>אפשר לנסות</span><button onClick={() => example('לאיתמר יש ביום חמישי יום הולדת לדניאל בשעה 17:00 וצריך להביא עוגה')}>🎂 לתכנן יום הולדת</button><button onClick={() => example('אני תקועה בעבודה ואגיע הביתה שעה מאוחר יותר')}>↗ שינוי בתוכניות</button><button onClick={() => example('זוהה פקק בוויז בדרך לאימון')}>🚗 עדכון מוויז</button><button onClick={() => example('זוהה אירוע מהודעת וואטסאפ של אשתי')}>💬 אירוע מוואטסאפ</button></div></section>

  return <div className={`app-shell ${childMode ? 'child-mode' : ''}`} dir="rtl">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Sparkles size={19}/></span><span>אוטופיילוט <b>משפחתי</b><small>הבית שלכם, מסונכרן</small></span></div><div className="side-label">המרחב שלך</div><nav className="side-nav" aria-label="ניווט ראשי">{navigation.filter(item => !childMode || item.id !== 'more').map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><Icon size={19}/>{label}{id === 'home' && attentionCount > 0 && <i className="nav-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="connected-mini"><span className="online-dot"/> כל המשפחה באותה תוכנית</div><button className="family-switch" onClick={() => setFamilyMenu(!familyMenu)}><span className="avatar sage">⌂</span><span><strong>{family.name}</strong><small>{family.people.length} בני משפחה</small></span><ChevronDown size={15}/></button>{familyMenu && <div className="switch-menu side-menu">{data.families.map(f => <button key={f.id} onClick={() => changeFamily(f.id)}>{f.name} {f.id === family.id && <Check size={15}/>}</button>)}<button className="menu-add" onClick={() => { setFamilyMenu(false); openFamily() }}><Plus size={15}/> תא משפחתי חדש</button></div>}</div></aside>
    <div className="main-column"><header className="topbar"><div className="topbar-family"><span className="mobile-logo"><Sparkles size={17}/> אוטופיילוט משפחתי</span><span className="desktop-date">{new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span></div><div className="topbar-actions"><span className="demo-pill"><span/> התוכנית מעודכנת</span><button className="top-family" onClick={() => setFamilyMenu(!familyMenu)}>{family.name}<ChevronDown size={14}/></button>{familyMenu && <div className="switch-menu top-menu">{data.families.map(f => <button key={f.id} onClick={() => changeFamily(f.id)}>{f.name} {f.id === family.id && <Check size={15}/>}</button>)}<button className="menu-add" onClick={() => { setFamilyMenu(false); openFamily() }}><Plus size={15}/> תא משפחתי חדש</button></div>}<div className="profile-wrap"><button className="profile-button" onClick={() => setProfileMenu(!profileMenu)} aria-label="מעבר בין בני משפחה"><span className={`avatar ${currentPerson?.color || 'sage'}`}>{currentPerson?.name.slice(0, 1) || '?'}</span><span><strong>{currentPerson?.name || 'בחרו אדם'}</strong><small>המרחב האישי שלך</small></span><ChevronDown size={14}/></button>{profileMenu && <div className="switch-menu profile-menu"><div className="menu-caption">מעבר לתצוגה של</div>{family.people.map(p => <button key={p.id} onClick={() => { setPersonId(p.id); setProfileMenu(false); setView('home') }}><span className={`avatar mini ${p.color}`}>{p.name.slice(0, 1)}</span><span>{p.name}<small>{p.role}</small></span>{activePersonId === p.id && <Check size={15}/>}</button>)}{!family.people.length && <p>הוסיפו בן משפחה כדי להתחיל</p>}<button className="menu-add" onClick={() => { setProfileMenu(false); setView('family'); openPerson() }}><Plus size={15}/> הוספת בן משפחה</button></div>}</div></div></header>
      <main className="content">{view === 'home' ? childMode ? <><ChildHome person={currentPerson} family={family} data={data} events={myEvents} tasks={myTasks} onTasks={() => setView('tasks')} onCreateEvent={() => openEvent()}/><BirthdayReminderPanel reminders={birthdayReminders}/><ChildActions data={data} family={family} actorId={activePersonId} onAcknowledge={updateAcknowledgement}/></> : <><div className="welcome-row"><div><div className="eyebrow">התוכנית האישית <span/></div><h1>שלום {currentPerson?.name || 'משפחה'} <em>☀️</em></h1><p>הנה מה שחשוב לך היום ב־{family.name}.</p></div><div className="family-avatars">{family.people.map(p => <span title={p.name} key={p.id} className={`avatar ${p.color}`}>{p.name.slice(0, 1)}</span>)}</div></div><section className={`pulse-card family-status ${familyDecisionCount ? '' : 'covered'}`}><div className="pulse-icon">{familyDecisionCount ? <Sparkles size={25}/> : <CheckCircle2 size={25}/>}</div><div className="pulse-copy"><span className="pulse-kicker">מצב התא המשפחתי</span><h2>{familyDecisionCount ? 'צריך טיפול' : 'הכל בשליטה ✅'}</h2><p>{statusDetails}</p></div>{familyDecisionCount > 0 && <button className="pulse-action" onClick={() => (document.getElementById('workflow') || document.getElementById('decisions') || document.getElementById('attention') || document.querySelector('.request-board'))?.scrollIntoView({ behavior: 'smooth' })}>לטיפול <ArrowLeft size={16}/></button>}</section><BirthdayReminderPanel reminders={birthdayReminders}/><DecisionCenter data={data} family={family} actorId={activePersonId} futureRisks={futureRisks} onRespond={answerRide} onConfirm={approveRide} onFind={(eventId, riskId) => setDialog({ type: 'solution', eventId, riskId })}/><WorkflowHub data={data} family={family} actorId={activePersonId} onAcknowledge={updateAcknowledgement} onHandle={handleExternalUpdate} onOverride={approveRoutineException} onReview={reviewPendingAction}/><RequestBoard requests={requests} data={data} actorId={activePersonId} onRespond={answerRide} onConfirm={approveRide} onAlternative={id => setDialog({ type: 'alternative', requestId: id })} onWithdraw={id => setDialog({ type: 'withdraw', requestId: id })} onTransit={approveTransit}/><div className="dashboard-grid"><div className="left-stack"><section className="section-card"><div className="section-heading"><div><span className="section-kicker">מה בתוכנית</span><h2>בשבילך היום</h2></div><div className="heading-actions"><button className="text-link" onClick={() => setView('events')}>כל האירועים <ArrowLeft size={15}/></button><button className="text-link" onClick={() => openEvent()}><Plus size={16}/> אירוע</button></div></div>{todayEvents.length ? <div className="timeline">{todayEvents.map(e => <EventRow key={e.id} event={e} people={eventPeople(e)} onEdit={() => canEditEvents ? openEvent(e) : setToast('עריכת אירועים זמינה להורים')}/>)}</div> : <Empty text="אין לך אירועים היום. אפשר להוסיף אירוע חדש."/>}</section><section className="section-card"><div className="section-heading"><div><span className="section-kicker">בקרוב</span><h2>בהמשך השבוע</h2></div><button className="text-link" onClick={() => openEvent()}><Plus size={16}/> הוספה</button></div>{upcoming.length ? <div className="upcoming-list">{upcoming.map(e => <button className="upcoming-row" key={e.id} onClick={() => openEvent(e)}><span className="upcoming-date">{dateLabel(e.date)}</span><span className="upcoming-emoji">{e.icon}</span><span><strong>{e.title}</strong><small>{e.time} · {eventPeople(e)}{e.sourceNote ? ' · ' + e.sourceNote : ''}{e.details ? ` · ${e.details}` : ''}</small></span><Pencil size={14}/></button>)}</div> : <Empty text="אין אירועים נוספים בתוכנית שלך."/>}</section></div><div className="right-stack">{(attention.length + attentionTasks.length > 0) && <section className="attention-card" id="attention"><div className="section-heading"><div><span className="section-kicker">רק כשצריך החלטה</span><h2>צריך אותך</h2></div><span className="count-badge">{attention.length + attentionTasks.length}</span></div>{attention.length + attentionTasks.length ? <>{attention.map(e => <div className="issue-body" key={e.id}><span className="issue-icon">!</span><div><h3>{e.title}</h3><p>{dateLabel(e.date)} ב־{e.time} · {e.details}</p><div className="solution-hint"><Sparkles size={15}/> אפשר לבחור מי אחראי</div><button className="dark-button" onClick={() => { setForm({ responsibleId: family.people.find(p => p.id !== activePersonId && !pickupIneligibility(p, e, data))?.id || family.people.find(p => !pickupIneligibility(p, e, data))?.id || '' }); setDialog({ type: 'resolve', item: e }) }}>לפתור עכשיו <ArrowLeft size={15}/></button></div></div>)}{attentionTasks.map(t => <div className="issue-body" key={t.id}><span className="issue-icon">!</span><div><h3>{t.title}</h3><p>אין אחראי/ת למשימה · {dateLabel(t.due)}</p><div className="solution-hint"><Sparkles size={15}/> נדרש שיוך לבן משפחה</div><button className="dark-button" onClick={() => openTask(t)}>שיוך משימה <ArrowLeft size={15}/></button></div></div>)}</> : <div className="resolved-state"><span className="resolved-icon"><Check size={19}/></span><strong>הכול מטופל</strong><p>אין כרגע החלטות פתוחות עבורך.</p></div>}</section>}<ActivityFeed data={data} family={family}/><section className="section-card mini-tasks"><div className="section-heading"><div><span className="section-kicker">מה על הפרק</span><h2>המשימות שלי</h2></div><button className="text-link" onClick={() => setView('tasks')}>הכול <ArrowLeft size={15}/></button></div>{myTasks.slice(0, 3).map(t => <TaskRow key={t.id} task={t} onToggle={() => toggleTask(t)} onEdit={() => openTask(t)}/>)}{!myTasks.length && <Empty text="אין משימות שמשויכות אליך."/>}</section></div></div><IntegrationHub data={data} familyId={family.id} actorId={activePersonId} compact onRun={runExternalSource} onShowAll={() => setView('more')}/>{inputArea}<div className="trust-note"><ShieldCheck size={16}/> כל פרטי המשפחה והתוכנית זמינים כאן במקום אחד.</div></> : view === 'events' ? <><div className="page-header"><div><div className="eyebrow">הלוח האישי שלך</div><h1>{listScope === 'mine' ? 'כל האירועים של ' + (currentPerson?.name || 'המשפחה') : 'כל האירועים של ' + family.name}</h1><p>אפשר לעדכן ולמחוק גם אירועים שלא מופיעים בתקציר הבית.</p></div><button className="dark-button event-create-button" onClick={() => openEvent()}><Plus size={17}/> אירוע חדש</button></div><ScopeSwitch value={listScope} onChange={setListScope}/><WeeklySchedule family={family} actorId={activePersonId} scope={listScope}/><div className="section-card all-events">{(listScope === 'mine' ? myEvents : familyEvents).length ? (listScope === 'mine' ? myEvents : familyEvents).map(e => <div className="dated-event" key={e.id}><span>{dateLabel(e.date)}</span><EventRow event={e} people={eventPeople(e)} onEdit={() => canEditEvents ? openEvent(e) : setToast('עריכת אירועים זמינה להורים')}/></div>) : <Empty text="אין אירועים בתצוגה הזו."/>}</div></> : view === 'family' ? <><div className="page-header"><div><div className="eyebrow">האנשים שמאחורי התוכנית</div><h1>המשפחה שלך</h1><p>נהלו תאים משפחתיים ואת האנשים בכל תא.</p></div><button className="light-button" onClick={() => openFamily()}><Plus size={17}/> תא משפחתי חדש</button></div><div className="family-tabs">{data.families.map(f => <button key={f.id} className={family.id === f.id ? 'selected' : ''} onClick={() => changeFamily(f.id)}>{f.name}</button>)}</div><div className="section-card family-management"><div className="section-heading"><div><span className="section-kicker">התא הנוכחי</span><h2>{family.name}</h2></div><div className="heading-actions"><button className="subtle-button" onClick={() => openFamily(family)}><Pencil size={15}/> שינוי שם</button><button className="subtle-button danger" onClick={() => removeFamily(family)}><Trash2 size={15}/> מחיקה</button></div></div><div className="person-grid">{family.people.map(p => <div className="person-card" key={p.id}><span className={`avatar large ${p.color}`}>{p.name.slice(0, 1)}</span><div><strong>{p.name}</strong><small>{p.role} · {`גיל ${p.birthDate ? ageFromBirthDate(p.birthDate) : p.age}`}</small>{!p.birthDate && <small>תאריך לידה מלא חסר לתזכורת</small>}<small>{canDrive(p) ? 'יכול/ה להסיע' : drivingIneligibility(p)}</small><small>{p.routines?.length ? `${p.routines.length} פריטי לו״ז קבוע` : 'טרם הוגדר לו״ז קבוע'}</small></div>{p.id === activePersonId && <span className="you-badge">התצוגה שלך</span>}<div className="card-actions"><button onClick={() => openPerson(p)} aria-label={`עריכת ${p.name}`}><Pencil size={16}/></button><button onClick={() => removePerson(p)} aria-label={`הסרת ${p.name}`}><Trash2 size={16}/></button></div></div>)}<button className="add-card" onClick={() => openPerson()}><Plus size={21}/><strong>הוספת בן משפחה</strong><small>ייכלל בלוח ובשיוך משימות</small></button></div></div><BirthdayReminderPanel reminders={birthdayReminders}/><div className="info-panel"><ShieldCheck size={19}/><span>מעבר בין אנשים נעשה דרך בורר הפרופיל למעלה. אפשר לעבור בין בני המשפחה ללא סיסמה.</span></div></> : view === 'tasks' ? <><div className="page-header"><div><div className="eyebrow">אחריות משותפת</div><h1>{listScope === 'mine' ? 'המשימות של ' + (currentPerson?.name || 'המשפחה') : 'המשימות של ' + family.name}</h1><p>כאן מופיעות רק משימות ששויכו אליך ב־{family.name}.</p></div><button className="dark-button" onClick={() => openTask()}><Plus size={17}/> משימה חדשה</button></div><div className="section-card task-list"><div className="section-heading"><div><span className="section-kicker">לפי מועד</span><h2>משימות</h2></div></div><ScopeSwitch value={listScope} onChange={setListScope}/>{(listScope === 'mine' ? myTasks : familyTasks).sort((a, b) => a.due.localeCompare(b.due)).map(t => <TaskRow key={t.id} task={t} owner={listScope === 'family' ? personName(t.ownerId) : undefined} onToggle={() => toggleTask(t)} onEdit={() => openTask(t)}/>)}{(listScope === 'mine' ? myTasks : familyTasks).length === 0 && <Empty text="אין כאן משימות עדיין. אפשר ליצור אחת חדשה."/>}</div></> : view === 'assistant' ? <><div className="page-header"><div><div className="eyebrow">עדכון אחד, תוכנית מתואמת</div><h1>איך אפשר לעזור?</h1><p>דברו בשפה חופשית. העוזר מזהה תרחישי תוכנית ומכין תוכנית לאישורכם.</p></div></div>{inputArea}<div className="info-panel"><Sparkles size={19}/><span>אפשר לנסות תכנון יום הולדת או שינוי בגלל איחור בעבודה. הפעולות זמינות ומתעדכנות רק אחרי אישור.</span></div></> : <><div className="page-header"><div><div className="eyebrow">שליטה ושקיפות</div><h1>הכול בידיים שלכם</h1><p>אפשר לנהל את המידע המקומי ואת אופן התוכנית.</p></div></div>{!childMode && <FamilyPreferencesPanel family={family} onPreferences={updateFamilyPreferences} onPerson={updatePersonPreferences}/>}<WorkflowHub data={data} family={family} actorId={activePersonId} onAcknowledge={updateAcknowledgement} onHandle={handleExternalUpdate} onOverride={approveRoutineException} onReview={reviewPendingAction}/><IntegrationHub data={data} familyId={family.id} actorId={activePersonId} onRun={runExternalSource}/><AutopilotHub onRun={runFamilyScenario}/><div className="section-card preferences"><h2><ShieldCheck size={19}/> חיבורים זמינים</h2><p>וויז, וואטסאפ, בית הספר, האוניברסיטה ויומן גוגל מופעלים כאן כהדמיה מקומית בלבד. אין חיבור לחשבונות אמיתיים.</p></div><div className="section-card preferences"><h2>נתוני תוכנית</h2><p>החזרה להתחלה תמחק את השינויים המקומיים בכל התאים המשפחתיים בדפדפן הזה.</p><button className="secondary-button" onClick={() => { askConfirmation('לאפס את כל נתוני התוכנית? השינויים המקומיים יימחקו.', () => { setData(ensureRequests(structuredClone(initialData), 'maya')); setFamilyId(DEFAULT_FAMILY_ID); setPersonId('maya'); setView('home'); setToast('נתוני התוכנית אופסו') }) }}>איפוס נתוני תוכנית</button></div></>}</main></div>
    <nav className="mobile-nav" aria-label="ניווט בנייד">{navigation.filter(item => !childMode || item.id !== 'more').map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>
    {(dialog || processing) && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !processing) setDialog(null) }}><div className="plan-modal" role="dialog" aria-modal="true" aria-label="חלון עריכה"><button className="modal-close" onClick={() => setDialog(null)} aria-label="סגירה"><X size={19}/></button>{processing ? <div className="processing"><span className="processing-orb"><Sparkles size={27}/></span><h2>מחברים את כל הפרטים...</h2><p>בודקים את לוח המשפחה, האחריות וזמני הנסיעה.</p><div className="processing-bar"><span/></div></div> : dialog?.type === 'event' ? <><ModalHeading title={dialog.item ? 'עריכת אירוע' : 'אירוע חדש'} description={dialog.item?.sourceNote || 'מה קורה, מתי ולמי זה רלוונטי?'}/><div className="form-grid"><Field label="שם האירוע"><input required value={form.title || ''} onChange={e => updateForm('title', e.target.value)} placeholder="למשל, חוג שחייה"/></Field><Field label="תאריך"><input type="date" value={form.date || ''} onChange={e => updateForm('date', e.target.value)}/></Field><Field label="שעה"><input type="time" value={form.time || ''} onChange={e => updateForm('time', e.target.value)}/></Field><Field label="פרטי הגעה / הערה"><input value={form.details || ''} onChange={e => updateForm('details', e.target.value)} placeholder="למשל, נקודת מפגש וכתובת"/></Field></div><label className="rule-check"><input type="checkbox" checked={form.requiresDriver === 'true'} onChange={e => updateForm('requiresDriver', String(e.target.checked))}/> נדרשת הסעה · תיפתח בקשה לנהגים כשירים</label>{form.requiresDriver === 'true' && <><Field label="נהג/ת מועדף/ת (רשות)"><select value={form.preferredDriverId || ''} onChange={e => updateForm('preferredDriverId', e.target.value)}><option value="">ללא העדפה</option>{family.people.filter(person => person.age >= 18).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><label className="rule-check"><input type="checkbox" checked={form.transitAvailable === 'true'} onChange={e => updateForm('transitAvailable', String(e.target.checked))}/>קיימת חלופה בתחבורה ציבורית</label></>}{form.requiresDriver === 'true' && <Field label="מי צריך/ה הסעה?"><select value={form.passengerId || ''} onChange={e => updateForm('passengerId', e.target.value)}><option value="">בחירת בן משפחה</option>{family.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}<div className="field-label">למי האירוע רלוונטי?</div><div className="checks">{family.people.map(p => <label key={p.id}><input type="checkbox" checked={participants.includes(p.id)} onChange={() => setParticipants(previous => previous.includes(p.id) ? previous.filter(id => id !== p.id) : [...previous, p.id])}/>{p.name}</label>)}</div><details className="advanced-options"><summary>אפשרויות נוספות</summary><div className="form-grid"><Field label="סמל"><input value={form.icon || ''} onChange={e => updateForm('icon', e.target.value)} maxLength={4}/></Field><Field label="שעת סיום (רשות)"><input type="time" value={form.endTime || ''} onChange={e => updateForm('endTime', e.target.value)}/></Field><Field label="חשיבות"><select value={form.priority || 'normal'} onChange={e => updateForm('priority', e.target.value)}>{(Object.entries(priorityLabels) as [Priority, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div><label className="rule-check"><input type="checkbox" checked={form.routineOverride === 'true'} onChange={e => updateForm('routineOverride', String(e.target.checked))}/>אירוע חריג: מאשרים חפיפה ללו״ז הקבוע</label><ResponsibilityEditor people={family.people} items={responsibilities} onChange={setResponsibilities} suggestOwner={suggestResponsibilityOwner}/></details><ModalActions onSave={() => saveForm()} onDelete={dialog.item ? () => removeEvent(dialog.item!) : undefined} disabled={!form.title?.trim() || !form.date || !form.time || (form.requiresDriver === 'true' ? !form.passengerId : !participants.length)}/></> : dialog?.type === 'task' ? <><ModalHeading title={dialog.item ? 'עריכת משימה' : 'משימה חדשה'} description="משימה ברורה, עם אחראי ומועד."/><div className="form-grid"><Field label="שם המשימה"><input value={form.title || ''} onChange={e => updateForm('title', e.target.value)} placeholder="מה צריך לעשות?"/></Field><Field label="עד מתי"><input type="date" value={form.due || ''} onChange={e => updateForm('due', e.target.value)}/></Field><Field label="אחראי/ת"><select value={form.ownerId || ''} onChange={e => updateForm('ownerId', e.target.value)}><option value="">ללא שיוך</option>{family.people.map(p => <option key={p.id} value={p.id} disabled={form.requiresAdult === 'true' && p.age < 18}>{p.name}{form.requiresAdult === 'true' && p.age < 18 ? ' · נדרש מבוגר' : ''}</option>)}</select></Field></div><details className="advanced-options"><summary>אפשרויות נוספות</summary><div className="form-grid"><Field label="חשיבות"><select value={form.priority || 'normal'} onChange={e => updateForm('priority', e.target.value)}>{(Object.entries(priorityLabels) as [Priority, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div><label className="rule-check"><input type="checkbox" checked={form.requiresAdult === 'true'} onChange={e => updateForm('requiresAdult', String(e.target.checked))}/> המשימה דורשת מבוגר/ת</label><label className="rule-check"><input type="checkbox" checked={form.flexible === 'true'} onChange={e => updateForm('flexible', String(e.target.checked))}/>אפשר לדחות את המשימה אם צריך</label><div className="repeat-editor"><strong>חוזר בכל שבוע</strong><div>{routineDays.map((day, index) => <label key={day}><input type="checkbox" checked={(form.repeatDays || '').split(',').includes(String(index))} onChange={event => { const days = new Set((form.repeatDays || '').split(',').filter(Boolean)); event.target.checked ? days.add(String(index)) : days.delete(String(index)); updateForm('repeatDays', [...days].join(',')) }}/>{day}</label>)}</div><small>בסימון השלמה, המשימה תועבר למועד הבא בלו״ז.</small></div></details><ModalActions onSave={() => saveForm()} onDelete={dialog.item ? () => removeTask(dialog.item!) : undefined} disabled={!form.title?.trim() || !form.due}/></> : dialog?.type === 'person' ? <><ModalHeading title={dialog.item ? 'עריכת בן משפחה' : 'בן משפחה חדש'} description={`הפרטים שייכים ל־${family.name}.`}/><div className="form-grid"><Field label="שם"><input value={form.name || ''} onChange={e => updateForm('name', e.target.value)} placeholder="שם פרטי"/></Field><Field label="תפקיד במשפחה"><select value={form.role || 'בן'} onChange={e => updateForm('role', e.target.value)}><option value="אב">אב</option><option value="אם">אם</option><option value="בן">בן</option><option value="בת">בת</option></select></Field><Field label="תאריך לידה מלא"><input required type="date" max={localDate()} value={form.birthDate || ''} onChange={e => updateForm('birthDate', e.target.value)}/></Field>{dialog.item && !form.birthDate && <p className="birthdate-hint">שמורה רק שנת לידה או גיל. השלימו יום וחודש כדי לקבל תזכורת ליום ההולדת.</p>}<Field label="צבע פרופיל"><select value={form.color || 'sage'} onChange={e => updateForm('color', e.target.value)}><option value="peach">אפרסק</option><option value="sage">מרווה</option><option value="lavender">לבנדר</option><option value="butter">חמאה</option></select></Field></div><RoutineEditor routines={routines} people={family.people} onChange={setRoutines}/><div className="person-rules"><label className="rule-check"><input type="checkbox" checked={form.hasLicense === 'true'} disabled={Number(form.age) < 18} onChange={e => updateForm('hasLicense', String(e.target.checked))}/> רישיון נהיגה</label><label className="rule-check"><input type="checkbox" checked={form.hasCar === 'true'} disabled={Number(form.age) < 18} onChange={e => updateForm('hasCar', String(e.target.checked))}/> גישה לרכב</label><label className="rule-check"><input type="checkbox" checked={form.availableForPickup === 'true'} disabled={Number(form.age) < 18} onChange={e => updateForm('availableForPickup', String(e.target.checked))}/> זמין/ה לאיסוף</label></div><div className="form-grid availability-form"><Field label="זמינות נוכחית"><select value={form.availability || 'available'} onChange={e => updateForm('availability', e.target.value)}><option value="available">זמין/ה</option><option value="home">בבית</option><option value="work">בעבודה</option><option value="travel">בנסיעה</option><option value="unavailable">לא זמין/ה</option></select></Field><Field label="עד מתי? (רשות)"><input type="datetime-local" value={form.unavailableUntil || ''} disabled={form.availability === 'available' || form.availability === 'home'} onChange={e => updateForm('unavailableUntil', e.target.value)}/></Field></div><ModalActions onSave={() => saveForm()} onDelete={dialog.item ? () => removePerson(dialog.item!) : undefined} disabled={!form.name?.trim() || (!dialog.item && !form.birthDate) || !!form.birthDate && !validBirthDate(form.birthDate)}/></> : dialog?.type === 'family' ? <><ModalHeading title={dialog.item ? 'עריכת תא משפחתי' : 'תא משפחתי חדש'} description="לכל תא בני משפחה, אירועים ומשימות משלו."/><Field label="שם התא המשפחתי"><input value={form.name || ''} onChange={e => updateForm('name', e.target.value)} placeholder="למשל, המשפחה של סבתא"/></Field><ModalActions onSave={() => saveForm()} disabled={!form.name?.trim()}/></> : dialog?.type === 'resolve' ? <><ModalHeading title="נסדר את האיסוף" description={`${dialog.item.title} · ${dateLabel(dialog.item.date)} בשעה ${dialog.item.time}`}/><div className="plan-explain"><Sparkles size={18}/> בחרו מי ייקח אחריות. אחרי האישור האירוע יתעדכן אצל אותו אדם.</div><Field label="מי אחראי/ת?"><select value={form.responsibleId || ''} onChange={e => updateForm('responsibleId', e.target.value)}><option value="">בחרו בן משפחה</option>{family.people.map(p => <option key={p.id} value={p.id} disabled={!!dialog.item.requiresDriver && !!pickupIneligibility(p, dialog.item, data)}>{p.name}{dialog.item.requiresDriver && !!pickupIneligibility(p, dialog.item, data) ? ` · ${pickupIneligibility(p, dialog.item, data)}` : ''}</option>)}</select></Field><p className="eligibility-note">להסעה נדרשים גיל 18 ומעלה, רישיון, רכב וזמינות לאיסוף.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>לא עכשיו</button><button className="dark-button" disabled={!form.responsibleId || (!!dialog.item.requiresDriver && !family.people.some(p => p.id === form.responsibleId && !pickupIneligibility(p, dialog.item, data)))} onClick={() => resolve(dialog.item)}>אישור התוכנית <ArrowLeft size={16}/></button></div></> : dialog?.type === 'withdraw' ? <WithdrawReview requestId={dialog.requestId} data={data} onClose={() => setDialog(null)} onConfirm={() => { answerRide(dialog.requestId, 'CANNOT_DO'); setDialog(null) }}/> : dialog?.type === 'alternative' ? <AlternativeReview requestId={dialog.requestId} data={data} onClose={() => setDialog(null)} onConfirm={() => approveAlternative(dialog.requestId)}/> : dialog?.type === 'solution' ? dialog.riskId && futureRisks.find(item => item.id === dialog.riskId) ? <FutureSolutionReview data={data} risk={futureRisks.find(item => item.id === dialog.riskId)!} onClose={() => setDialog(null)} onConfirm={() => confirmFutureSolution(dialog.riskId!)}/> : <SolutionReview data={data} eventId={dialog.eventId} onClose={() => setDialog(null)} onApplySchedule={() => confirmSolution(dialog.eventId)} onConfirmRide={(requestId, driverId) => { approveRide(requestId, driverId); setDialog(null); setToast('ההסעה שובצה') }} onAlternative={requestId => setDialog({ type: 'alternative', requestId })}/> : dialog?.type === 'plan' ? <PlanReview dialog={dialog} data={data} family={family} actorId={activePersonId} impact={lateImpact} onClose={() => setDialog(null)} onConfirm={() => confirmPlan(dialog)}/> : <><ModalHeading title="בואו ננסה עדכון משפחתי" description="אפשר לתכנן יום הולדת או לדווח על איחור בעבודה."/><button className="dark-button" onClick={() => { setDialog(null); example('לאיתמר יש יום הולדת לדניאל מחר בשעה 17:00 וצריך להביא עוגה') }}>ננסה יום הולדת <ArrowLeft size={16}/></button></>}</div></div>}
    {confirmation && <div className="confirmation-backdrop"><div className="confirmation-card" role="alertdialog" aria-modal="true"><span className="modal-symbol"><ShieldCheck size={22}/></span><h2>אישור פעולה</h2><p>{confirmation.message}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setConfirmation(null)}>ביטול</button><button className="dark-button" onClick={() => { const action = confirmation.onConfirm; setConfirmation(null); action() }}>אישור</button></div></div></div>}{toast && <div className="toast" role="status"><span className="toast-icon"><Bell size={18}/></span><span className="toast-copy"><strong>עדכון משפחתי</strong><small>{toast}</small></span><button type="button" onClick={() => setToast('')} aria-label="סגירת הודעה" title="סגירה"><X size={18}/></button></div>}
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="form-field"><span>{label}</span>{children}</label> }
function WorkflowHub({ data, family, actorId, onAcknowledge, onHandle, onOverride, onReview }: { data: AppData; family: FamilyUnit; actorId: string; onAcknowledge: (eventId: string, status: 'seen' | 'approved' | 'declined') => void; onHandle: (id: string) => void; onOverride: (eventId: string) => void; onReview: (action: PendingAction, approved: boolean) => void }) {
  const pendingApprovals = (data.acknowledgements || []).filter(item => data.events.some(event => event.id === item.eventId && event.familyId === family.id) && item.status !== 'approved')
  const approvals = (data.acknowledgements || []).filter(item => pendingApprovals.some(pending => pending.eventId === item.eventId))
  const updates = data.integrationLogs.filter(item => item.familyId === family.id && !item.handledAt)
  const routineConflicts = routineConflictingEvents(data, family.id)
  const pendingActions = (data.pendingActions || []).filter(action => action.familyId === family.id)
  if (!pendingApprovals.length && !updates.length && !routineConflicts.length && !pendingActions.length) return null
  return <section className="section-card workflow-hub" id="workflow"><div className="section-heading"><div><span className="section-kicker">סוגרים את המעגל</span><h2>מחכה לאישור או לטיפול</h2></div><span className="count-badge">{pendingApprovals.length + updates.length + routineConflicts.length + pendingActions.length}</span></div>{approvals.map(item => { const event = data.events.find(entry => entry.id === item.eventId)!; const missed = new Date(`${event.date}T${event.time}:00`).getTime() < Date.now() && item.status === 'pending'; return <div className="workflow-item" key={`${item.eventId}:${item.personId}`}><div><strong>{event.title} · {family.people.find(person => person.id === item.personId)?.name || 'בן משפחה'}</strong><small>{dateLabel(event.date)} ב־{event.time} · {missed ? 'המועד עבר ללא תגובה' : item.status === 'approved' ? 'אושר' : item.status === 'seen' ? 'נראה, ממתין לאישור' : item.status === 'declined' ? 'נדחה, נדרש פתרון אחר' : 'ממתין לתגובה שלך'}</small></div>{item.personId === actorId && item.status !== 'approved' && <div className="workflow-actions">{item.status === 'pending' && <button className="secondary-button" onClick={() => onAcknowledge(item.eventId, 'seen')}>ראיתי</button>}<button className="dark-button" onClick={() => onAcknowledge(item.eventId, 'approved')}>מאשר/ת</button><button className="secondary-button" onClick={() => onAcknowledge(item.eventId, 'declined')}>לא מתאים לי</button></div>}</div> })}{routineConflicts.map(event => <div className="workflow-item" key={`routine:${event.id}`}><div><strong>{event.title}</strong><small>{dateLabel(event.date)} ב־{event.time} · חופף ללו״ז הקבוע של בן משפחה</small></div><button className="secondary-button" onClick={() => onOverride(event.id)}>אישור חריגה חד־פעמית</button></div>)}{pendingActions.map(action => <div className="workflow-item" key={action.id}><div><strong>שינוי רגיש ממתין לאישור</strong><small>{action.message}</small></div><div className="workflow-actions"><button className="dark-button" onClick={() => onReview(action, true)}>אישור פעולה</button><button className="secondary-button" onClick={() => onReview(action, false)}>דחייה</button></div></div>)}{updates.map(item => <div className="workflow-item" key={item.id}><div><strong>{integrationDisplayText(item.action)}</strong><small>עדכון מ־{integrationNames[item.source]} · {integrationDisplayText(item.sourceText)}</small></div><button className="secondary-button" onClick={() => onHandle(item.id)}>טופל</button></div>)}</section>
}
function ChildActions({ data, family, actorId, onAcknowledge }: { data: AppData; family: FamilyUnit; actorId: string; onAcknowledge: (eventId: string, status: 'seen' | 'approved' | 'declined') => void }) {
  const pending = (data.acknowledgements || []).filter(item => item.personId === actorId && item.status !== 'approved' && data.events.some(event => event.id === item.eventId && event.familyId === family.id))
  if (!pending.length) return null
  return <section className="section-card child-actions"><div className="section-heading"><h2>מחכה לתשובה שלך</h2></div>{pending.map(item => { const event = data.events.find(entry => entry.id === item.eventId)!; return <div className="workflow-item" key={event.id}><div><strong>{event.title}</strong><small>{dateLabel(event.date)} · {event.time} · {item.status === 'seen' ? 'ראית, מחכה לאישור' : item.status === 'declined' ? 'לא מתאים לך' : 'מחכה לתשובתך'}</small></div><div className="workflow-actions"><button className="dark-button" onClick={() => onAcknowledge(event.id, 'approved')}>מאשר/ת</button><button className="secondary-button" onClick={() => onAcknowledge(event.id, 'declined')}>לא מתאים לי</button></div></div> })}</section>
}
function RoutineEditor({ routines, people, onChange }: { routines: WeeklyRoutine[]; people: Person[]; onChange: (value: WeeklyRoutine[]) => void }) {
  const kinds: { id: RoutineKind; label: string; example: string }[] = [{ id: 'work', label: 'עובד/ת', example: 'עבודה' }, { id: 'study', label: 'לומד/ת', example: 'בית ספר / לימודים' }, { id: 'activity', label: 'פעילות קבועה', example: 'חוג / טיפול / התנדבות' }]
  const add = (kind: RoutineKind) => onChange([...routines, { id: uid(), kind, label: kinds.find(item => item.id === kind)!.example, day: -1, start: '', end: '', prepTitle: kind === 'study' ? 'להכין תיק לימודים' : kind === 'activity' ? 'להכין ציוד לפעילות' : '' }])
  const update = (id: string, changes: Partial<WeeklyRoutine>) => onChange(routines.map(item => item.id === id ? { ...item, ...changes } : item))
  return <section className="routine-editor"><h3>לו״ז שבועי קבוע</h3><p>סמנו עיסוק והגדירו שורה לכל יום ושעות. העוזר יתחשב בשעות האלה בתיאום.</p><div className="routine-kinds">{kinds.map(kind => <label key={kind.id}><input type="checkbox" checked={routines.some(item => item.kind === kind.id)} onChange={event => event.target.checked ? add(kind.id) : onChange(routines.filter(item => item.kind !== kind.id))}/>{kind.label}</label>)}</div>{routines.map(item => <div className="routine-entry" key={item.id}><div className="routine-row"><input aria-label="שם הפעילות" value={item.label} onChange={event => update(item.id, { label: event.target.value })}/><select aria-label="יום בשבוע" value={item.day} onChange={event => update(item.id, { day: Number(event.target.value) })}><option value={-1}>בחרו יום</option>{routineDays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><input type="time" aria-label="שעת התחלה" value={item.start} onChange={event => update(item.id, { start: event.target.value })}/><input type="time" aria-label="שעת סיום" value={item.end} onChange={event => update(item.id, { end: event.target.value })}/><button type="button" aria-label="הסרת שורה" onClick={() => onChange(routines.filter(row => row.id !== item.id))}><X size={15}/></button></div><div className="routine-prep"><input aria-label="משימת הכנה חוזרת" value={item.prepTitle || ''} placeholder="משימת הכנה חוזרת, אם צריך" onChange={event => update(item.id, { prepTitle: event.target.value })}/><select aria-label="אחראי למשימת ההכנה" value={item.prepOwnerId || ''} onChange={event => update(item.id, { prepOwnerId: event.target.value })}><option value="">ברירת מחדל (מבוגר לילד)</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div></div>)}{routines.length > 0 && <div className="routine-add">{kinds.filter(kind => routines.some(item => item.kind === kind.id)).map(kind => <button type="button" key={kind.id} onClick={() => add(kind.id)}><Plus size={14}/> עוד יום של {kind.label}</button>)}</div>}</section>
}
function ResponsibilityEditor({ people, items, onChange, suggestOwner }: { people: Person[]; items: Pick<FamilyTask, 'id' | 'title' | 'ownerId'>[]; onChange: (items: Pick<FamilyTask, 'id' | 'title' | 'ownerId'>[]) => void; suggestOwner: () => string }) {
  const update = (id: string, changes: Partial<Pick<FamilyTask, 'title' | 'ownerId'>>) => onChange(items.map(item => item.id === id ? { ...item, ...changes } : item))
  return <section className="responsibility-editor"><h3>מי אחראי על מה?</h3><p>אפשר להוסיף הכנות לאירוע. העוזר מציע אדם פנוי לפי הלו״ז והעומס שלו.</p>{items.map(item => <div className="responsibility-row" key={item.id}><input aria-label="מה צריך לעשות" value={item.title} onChange={event => update(item.id, { title: event.target.value })} placeholder="למשל להביא עוגה"/><select aria-label="אחראי או אחראית" value={item.ownerId} onChange={event => update(item.id, { ownerId: event.target.value })}><option value="">ללא אחראי/ת</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select><button type="button" aria-label="הסרת אחריות" onClick={() => onChange(items.filter(row => row.id !== item.id))}><X size={15}/></button></div>)}<div className="responsibility-add">{['להביא ציוד', 'להביא כיבוד', 'לשלם', 'להכין מראש', 'משימה אחרת'].map(title => <button type="button" key={title} onClick={() => onChange([...items, { id: uid(), title: title === 'משימה אחרת' ? '' : title, ownerId: suggestOwner() }])}><Plus size={13}/>{title}</button>)}</div></section>
}
function ModalHeading({ title, description }: { title: string; description: string }) { return <div className="modal-heading"><span className="modal-symbol"><Sparkles size={22}/></span><h2>{title}</h2><p>{description}</p></div> }
function ModalActions({ onSave, onDelete, disabled }: { onSave: () => void; onDelete?: () => void; disabled?: boolean }) { return <div className="modal-actions">{onDelete && <button className="delete-button" onClick={onDelete}><Trash2 size={15}/> מחיקה</button>}<button className="dark-button" disabled={disabled} onClick={onSave}>שמירה <Check size={16}/></button></div> }
function Empty({ text }: { text: string }) { return <div className="empty-state">{text}</div> }
function WeeklySchedule({ family, actorId, scope }: { family: FamilyUnit; actorId: string; scope: 'mine' | 'family' }) {
  const people = family.people.filter(person => scope === 'family' || person.id === actorId)
  const personBlocks = people.map(person => {
    const routines = (person.routines || []).map(routine => {
      const days = Array.isArray(routine.days) && routine.days.length ? routine.days : Number.isInteger(routine.day) && routine.day! >= 0 ? [routine.day!] : []
      return {
        routine,
        dayRows: days.map(day => ({ day, label: routineDays[day], time: `${routine.start}–${routine.end}` })).sort((a, b) => a.day - b.day)
      }
    }).filter(entry => entry.dayRows.length > 0)
    return { person, routines }
  }).filter(block => block.routines.length > 0)

  return <section className="section-card weekly-schedule"><div className="section-heading"><div><span className="section-kicker">שעות שחוזרות מדי שבוע</span><h2>לו״ז קבוע</h2></div></div>{personBlocks.length ? <div className="weekly-family-grid">{personBlocks.map(({ person, routines }) => <div className="weekly-person-block" key={person.id}><div className="weekly-person-header">{person.name}</div>{routines.map(({ routine, dayRows }) => <div className="weekly-routine-group" key={routine.id}><div className="weekly-routine-name">{routine.label}</div>{dayRows.length > 0 && <div className="weekly-routine-table">{dayRows.map(({ day, label, time }) => <div className="weekly-routine-day" key={`${routine.id}:${day}`}><span>{label}</span><span>{time}</span></div>)}</div>}{routine.prepTitle && <small className="weekly-routine-meta">הכנה: {routine.prepTitle}</small>}</div>)}</div>)}</div> : <Empty text="עדיין לא הוגדר לו״ז קבוע. אפשר להוסיף אותו בעריכת בן משפחה."/>}</section>
}
function BirthdayReminderPanel({ reminders }: { reminders: BirthdayReminder[] }) {
  if (!reminders.length) return null
  return <section className="section-card birthday-reminders"><div className="section-heading"><div><span className="section-kicker">כדאי להתכונן</span><h2>ימי הולדת במשפחה 🎂</h2></div></div><div className="birthday-list">{reminders.map(({ person, date, daysUntil, turningAge }) => <div key={`${person.id}:${date}`}><span className={`avatar ${person.color}`}>{person.name.slice(0, 1)}</span><div><strong>{person.name} חוגג/ת {turningAge}</strong><small>{daysUntil === 0 ? 'היום!' : daysUntil === 1 ? 'מחר' : `בעוד ${daysUntil} ימים`} · {dateLabel(date)}</small></div></div>)}</div></section>
}
function DecisionCenter({ data, family, actorId, futureRisks, onRespond, onConfirm, onFind }: { data: AppData; family: FamilyUnit; actorId: string; futureRisks: ForecastRisk[]; onRespond: (id: string, response: 'CAN_DO' | 'CANNOT_DO') => void; onConfirm: (id: string, driverId: string) => void; onFind: (eventId: string, riskId?: string) => void }) {
  const now = Date.now()
  const soon = now + 2 * 60 * 60_000
  const issues = data.events.filter(event => {
    const time = new Date(`${event.date}T${event.time}:00`).getTime()
    return event.familyId === family.id && time >= now - 60 * 60_000 && time <= soon && (scheduleConflicts(data, event).length > 0 && !!event.createdById || !!requestForEvent(data, event.id) && requestForEvent(data, event.id)?.status !== 'COVERED')
  }).reverse().slice(0, 6)
  if (!issues.length && !futureRisks.length) return null
  const name = (id: string) => family.people.find(person => person.id === id)?.name || 'בן משפחה'
  return <section className="section-card decision-center" id="decisions"><div className="section-heading"><div><span className="section-kicker">האוטופיילוט זיהה</span><h2>דורש החלטה</h2></div><span className="count-badge">{issues.length + futureRisks.length}</span></div><div className="decision-list">{issues.map(event => {
    const request = requestForEvent(data, event.id)
    const conflicts = scheduleConflicts(data, event)
    const recommendation = request && recommendDriver(data, request)
    const pending = request?.responses[actorId] === 'PENDING' && request.eligibleMemberIds.includes(actorId)
    return <article className="decision-item" key={event.id}><span className="decision-icon">{event.icon}</span><div><strong>{event.title}</strong><p>{dateLabel(event.date)} · {event.time} · {event.participantIds.map(name).join(', ') || 'המשפחה'}</p><small className="decision-summary">{request?.status === 'UNRESOLVED' ? 'אין כרגע נהג זמין להסעה' : recommendation ? `${recommendation.person.name} זמין/ה להסעה` : conflicts.length ? 'יש חפיפה בתוכנית' : 'נדרשת החלטה לגבי ההסעה'}</small>{(conflicts.length > 0 || event.sourceNote || event.issueReason || event.createdById) && <details className="decision-details"><summary>למה?</summary>{event.createdById && <p>{addedBy(family.people.find(person => person.id === event.createdById))} את האירוע</p>}{conflicts.length > 0 && <p>חופף ל־{conflicts[0].title}</p>}{event.sourceNote && <p>{event.sourceNote}</p>}{event.issueReason && <p>{event.issueReason}</p>}</details>}<div className="decision-actions">{pending && <><button className="dark-button" onClick={() => onRespond(request!.id, 'CAN_DO')}>יכול/ה</button><button className="secondary-button" onClick={() => onRespond(request!.id, 'CANNOT_DO')}>לא יכול/ה</button></>}{recommendation && <button className="secondary-button" onClick={() => onConfirm(request!.id, recommendation.person.id)}>אשר שיבוץ</button>}<button className="secondary-button" onClick={() => onFind(event.id)}>מצא פתרון</button></div></div></article>
  })}</div>{futureRisks.length > 0 && <div className="forecast-list"><div className="forecast-heading"><span>מבט קדימה</span><small>בעיות שעשויות להשפיע על התוכנית בהמשך</small></div>{futureRisks.slice(0, 6).map(risk => <article className="forecast-item" key={risk.id}><span className="forecast-icon"><CalendarDays size={17}/></span><div><strong>{risk.title}</strong><details className="decision-details"><summary>למה?</summary><p>{risk.detail}</p>{risk.sourceNote && <small>{risk.sourceNote}</small>}</details><button className="secondary-button" onClick={() => onFind(risk.eventId, risk.id)}>מצא פתרון מראש</button></div></article>)}</div>}</section>
}
function AutopilotHub({ onRun }: { onRun: (scenario: AutopilotScenario) => void }) {
  return <section className="section-card autopilot-hub"><div className="section-heading"><div><span className="section-kicker">תרחישים משפחתיים</span><h2>מה יקרה כשהתוכנית משתנה?</h2></div></div><p className="integration-intro">אפשר להפעיל תרחיש כעת. חלק מהשינויים יופיעו גם מעצמם כשהאפליקציה פתוחה.</p><div className="autopilot-grid">{autopilotScenarios.map(scenario => <button className="autopilot-scenario" key={scenario.id} onClick={() => onRun(scenario.id)}><span>{scenario.icon}</span><strong>{scenario.label}</strong><ArrowLeft size={15}/></button>)}</div></section>
}
function SolutionReview({ data, eventId, onClose, onApplySchedule, onConfirmRide, onAlternative }: { data: AppData; eventId: string; onClose: () => void; onApplySchedule: () => void; onConfirmRide: (requestId: string, driverId: string) => void; onAlternative: (requestId: string) => void }) {
  const event = data.events.find(item => item.id === eventId)
  if (!event) return null
  const conflicts = scheduleConflicts(data, event)
  const schedule = suggestScheduleSolution(data, event)
  const request = requestForEvent(data, event.id)
  const recommendation = request && recommendDriver(data, request)
  const eligible = request && data.families.find(family => family.id === event.familyId)?.people.find(person => request.eligibleMemberIds.includes(person.id) && request.responses[person.id] === 'PENDING')
  const alternative = request && alternativeForRequest(data, request)
  return <><ModalHeading title="מצאתי פתרון אפשרי" description={`${event.title} · ${dateLabel(event.date)} ב־${event.time}`}/>{conflicts.length && schedule ? <><div className="plan-explain"><Sparkles size={18}/> האירוע חופף ל־{conflicts[0].title}. מוצע להעביר אותו ל־{dateLabel(schedule.date)} ב־{schedule.time}.</div><p className="solution-reason">{schedule.reason} אם האירוע דורש הסעה, הנהגים יתבקשו להשיב מחדש.</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>לא עכשיו</button><button className="dark-button" onClick={onApplySchedule}>אשר פתרון</button></div></> : recommendation ? <><div className="plan-explain"><Sparkles size={18}/> {recommendation.person.name} אישר/ה שהוא/היא יכול/ה להסיע ל־{event.title}.</div><p className="solution-reason">{recommendation.reason}</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>לא עכשיו</button><button className="dark-button" onClick={() => onConfirmRide(request!.id, recommendation.person.id)}>אשר פתרון</button></div></> : request?.status === 'UNRESOLVED' && alternative ? <><div className="plan-explain"><Sparkles size={18}/> {alternative.title}</div><p className="solution-reason">{alternative.reason}</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>לא עכשיו</button><button className="dark-button" onClick={() => onAlternative(request.id)}>המשך לפתרון</button></div></> : <><div className="plan-explain"><Sparkles size={18}/> {eligible ? `${eligible.name} פנוי/ה ועומד/ת בתנאי הנהיגה. בקשת ההסעה ממתינה לתשובה אישית שלו/ה.` : request ? 'עדיין אין נהג/ת שאישר/ה את ההסעה.' : 'לא נמצא כרגע מועד חלופי ללא התנגשות.'}</div><p className="solution-reason">{request ? 'שיבוץ יתאפשר אחרי שאחד הנהגים הכשירים יסמן יכול/ה.' : 'אפשר לערוך את מועד האירוע ידנית או לשנות את האירוע החופף.'}</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>סגירה</button></div></>}</>
}
function FutureSolutionReview({ data, risk, onClose, onConfirm }: { data: AppData; risk: ForecastRisk; onClose: () => void; onConfirm: () => void }) {
  const solution = suggestForecastSolution(data, risk)
  return <><ModalHeading title="פתרון מראש" description={risk.title}/><div className="plan-explain"><Sparkles size={18}/>{solution ? solution.title : risk.kind === 'ride' ? 'בקשת ההסעה כבר נשלחה לנהגים הכשירים.' : 'לא נמצא כרגע מועד חלופי בטוח בתוכנית.'}</div><p className="solution-reason">{solution ? solution.reason : risk.kind === 'ride' ? 'שיבוץ יתאפשר אחרי שאחד מהם יסמן יכול/ה. אפשר גם לעדכן זמינות או לערוך את האירוע.' : 'אפשר לבדוק זמינות של נהג נוסף או לערוך את האירוע ידנית.'}</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>סגירה</button>{solution && <button className="dark-button" onClick={onConfirm}>אשר פתרון</button>}</div></>
}
const priorityLabels: Record<Priority, string> = { low: 'נמוכה', normal: 'רגילה', high: 'גבוהה', critical: 'לא ניתן להזיז' }
function FamilyPreferencesPanel({ family, onPreferences, onPerson }: { family: FamilyUnit; onPreferences: (changes: FamilyPreferences) => void; onPerson: (id: string, changes: Partial<Person>) => void }) {
  const preferences = family.preferences || {}
  const rules: { key: Exclude<keyof FamilyPreferences, 'autonomy'>; label: string; defaultValue: boolean }[] = [
    { key: 'preferFewerTrips', label: 'להעדיף פחות נסיעות', defaultValue: false },
    { key: 'balanceRides', label: 'לאזן את ההסעות בין הנהגים', defaultValue: true },
    { key: 'preferNearbyDriver', label: 'להעדיף נהג קרוב ליעד', defaultValue: true },
    { key: 'moveFlexibleTasks', label: 'לאפשר דחייה של משימות גמישות', defaultValue: true },
    { key: 'allowPublicTransit', label: 'לאפשר תחבורה ציבורית כשיש חלופה בטוחה', defaultValue: false },
  ]
  return <section className="section-card family-preferences"><div className="section-heading"><div><span className="section-kicker">התוכנית שלכם</span><h2>חוקים והעדפות משפחתיות</h2></div></div><p>ההעדפות נשמרות עבור {family.name} ומשפיעות על המלצות ההסעה והפתרונות.</p><div className="autonomy-choice"><strong>רמת פעולה אוטומטית</strong><select value={preferences.autonomy || 'autopilot'} onChange={event => onPreferences({ autonomy: event.target.value as FamilyPreferences['autonomy'] })}><option value="conservative">שמרני · זיהוי בלבד, בלי פעולות רקע</option><option value="balanced">רגיל · עדכוני זמינות והזזת משימות גמישות</option><option value="autopilot">אוטופיילוט · תרחישים ועדכונים אוטומטיים, עם אישור לשינוי רגיש</option></select><small>שינוי שמשפיע על בן משפחה אחר נשאר פתוח עד לאישורו. רכישות וביטולים דורשים פעולה מפורשת.</small></div><div className="preference-grid">{rules.map(rule => <label className="rule-check" key={rule.key}><input type="checkbox" checked={preferences[rule.key] ?? rule.defaultValue} onChange={event => onPreferences({ [rule.key]: event.target.checked })}/>{rule.label}</label>)}</div><div className="person-preferences">{family.people.map(person => <div className="person-preference" key={person.id}><strong>{person.name}</strong><div className="preference-grid"><label className="rule-check"><input type="checkbox" checked={person.age >= 18 && person.activeDriver !== false} disabled={person.age < 18} onChange={event => onPerson(person.id, { activeDriver: event.target.checked })}/>נהג/ת פעיל/ה</label><label className="rule-check"><input type="checkbox" checked={!!person.lastResortDriver} disabled={person.age < 18} onChange={event => onPerson(person.id, { lastResortDriver: event.target.checked })}/>לבחור רק כאפשרות אחרונה</label><label className="rule-check"><input type="checkbox" checked={!!person.canUseTransit} onChange={event => onPerson(person.id, { canUseTransit: event.target.checked })}/>יכול/ה להשתמש בתחבורה ציבורית</label><label className="rule-check"><input type="checkbox" checked={!!person.canTravelAlone} disabled={person.age < 12} onChange={event => onPerson(person.id, { canTravelAlone: event.target.checked })}/>רשאי/ת לנסוע לבד</label></div><div className="form-grid"><Field label="מקסימום הסעות מועדף ביום"><input type="number" min="0" max="10" value={person.preferredMaxRides ?? ''} disabled={person.age < 18} onChange={event => onPerson(person.id, { preferredMaxRides: event.target.value === '' ? undefined : Math.max(0, Math.min(10, Number(event.target.value))) })}/></Field><Field label="לא פנוי/ה בדרך כלל משעה"><input type="time" value={person.unavailableFrom || ''} disabled={person.age < 18} onChange={event => onPerson(person.id, { unavailableFrom: event.target.value })}/></Field><Field label="עד שעה"><input type="time" value={person.unavailableTo || ''} disabled={person.age < 18} onChange={event => onPerson(person.id, { unavailableTo: event.target.value })}/></Field></div></div>)}</div></section>
}
function ExternalScenarioGroups({ onRun }: { onRun: (scenario: ExternalScenarioId) => void }) {
  const groups = [...new Set(externalScenarios.map(scenario => scenario.source))]
  return <div className="external-groups">{groups.map(source => <div className="external-group" key={source}><h3>{integrationNames[source]}</h3><div className="external-scenarios">{externalScenarios.filter(scenario => scenario.source === source).map(scenario => <div className="external-scenario" key={scenario.id}><span>{scenario.icon}</span><div><strong>{scenario.title}</strong><small>{scenario.description}</small></div><button className="secondary-button" onClick={() => onRun(scenario.id)}>הפעל</button></div>)}</div></div>)}</div>
}
function IntegrationHub({ data, familyId, actorId, compact = false, onRun, onShowAll }: { data: AppData; familyId: string; actorId: string; compact?: boolean; onRun: (source: ExternalScenarioId) => void; onShowAll?: () => void }) {
  const sources: { id: IntegrationScenario; icon: string; description: string }[] = [
    { id: 'waze', icon: '🚗', description: 'פקקים משנים את שעת היציאה להסעה משובצת.' },
    { id: 'whatsapp', icon: '💬', description: 'הודעה מבן משפחה יוצרת אירוע ביומן גוגל.' },
    { id: 'school', icon: '🏫', description: 'מייל מבית הספר משנה אירוע ויוצר משימה.' },
    { id: 'university', icon: '🎓', description: 'מייל מהאוניברסיטה מוסיף אירוע ללוח וליומן.' },
  ]
  const allLogs = data.integrationLogs.filter(entry => entry.familyId === familyId)
  const visibleLogs = compact ? allLogs.filter(entry => entry.personIds.includes(actorId)).slice(0, 2) : allLogs
  return <section className="section-card integration-hub">
    <div className="section-heading"><div><span className="section-kicker">עדכונים ממקורות</span><h2>{compact ? 'מה התעדכן בשבילך' : 'מרכז העדכונים'}</h2></div>{compact && <button className="text-link" onClick={onShowAll}>לכל העדכונים <ArrowLeft size={15}/></button>}</div>
    {compact ? <div className="integration-source-chips">{[...new Set(externalScenarios.map(scenario => scenario.source))].slice(0, 6).map(source => <span key={source}>{integrationNames[source]}</span>)}</div> : <><p className="integration-intro">בחרו עדכון כדי לראות איך הוא משנה את התוכנית. עדכונים מסוימים מופיעים גם בזמן שהאפליקציה פתוחה.</p><ExternalScenarioGroups onRun={onRun}/></>}
    {visibleLogs.length ? <div className="integration-log-list">{visibleLogs.map(entry => <div className="integration-log" key={entry.id}><span>{externalScenarios.find(scenario => scenario.source === entry.source)?.icon || sources.find(source => source.id === entry.source)?.icon || '👨‍👩‍👧‍👦'}</span><div><strong>{integrationDisplayText(entry.action)}</strong>{entry.trigger === 'automatic' && <em>זוהה אוטומטית</em>}<em>{entry.handledAt ? 'טופל' : 'ממתין לטיפול'}</em><small>{integrationDisplayText(entry.sourceText)}</small>{data.calendarMirrors.some(mirror => mirror.eventId === entry.eventId) && <em>נוסף ליומן גוגל</em>}</div></div>)}</div> : <p className="integration-empty">עדיין אין עדכונים. אפשר להפעיל תרחיש במרכז העדכונים.</p>}
  </section>
}
function FamilySnapshot({ family, events, actorId }: { family: FamilyUnit; events: FamilyEvent[]; actorId: string }) {
  const others = family.people.filter(person => person.id !== actorId)
  if (!others.length) return null
  return <section className="section-card family-snapshot"><div className="section-heading"><div><span className="section-kicker">במבט אחד</span><h2>המשפחה היום</h2></div></div><div className="snapshot-list">{others.map(person => { const next = events.find(event => event.date === localDate() && (event.participantIds.includes(person.id) || event.responsibleId === person.id)); const availability = person.availability === 'home' ? 'בבית' : person.availability === 'work' ? 'בעבודה' : person.availability === 'travel' ? 'בנסיעה' : person.availability === 'unavailable' ? 'לא זמין/ה' : 'זמין/ה'; return <div key={person.id}><span className={`avatar ${person.color}`}>{person.name.slice(0, 1)}</span><strong>{person.name}</strong><small>{person.availability && person.availability !== 'available' ? availability : next ? `${next.icon} ${next.title} · ${next.time}` : 'אין אירוע היום'}</small></div> })}</div></section>
}
function ChildHome({ person, family, data, events, tasks, onTasks, onCreateEvent }: { person?: Person; family: FamilyUnit; data: AppData; events: FamilyEvent[]; tasks: FamilyTask[]; onTasks: () => void; onCreateEvent: () => void }) {
  const rides = data.transportationRequests.filter(request => request.familyId === family.id && request.passengerId === person?.id)
  const name = (id: string) => family.people.find(member => member.id === id)?.name || 'בן משפחה'
  const today = events.filter(event => event.date === localDate())
  const upcoming = events.filter(event => event.date > localDate()).slice(0, 3)
  const reminders = tasks.filter(task => !task.done)
  return <div className="child-home"><button className="dark-button child-add-event" onClick={onCreateEvent}><Plus size={16}/> הוספת אירוע</button><div className="welcome-row"><div><div className="eyebrow">היום שלך <span/></div><h1>שלום, {person?.name} 👋</h1><p>האירועים והתזכורות ששייכים לך ב־{family.name}.</p></div></div><section className="pulse-card covered"><div className="pulse-icon"><Sparkles size={25}/></div><div className="pulse-copy"><span className="pulse-kicker">בשבילך היום</span><h2>{today.length ? `${today.length} דברים בתוכנית שלך` : 'יום רגוע לפניך'}</h2><p>{reminders.length ? `ויש לך ${reminders.length} תזכורות פתוחות.` : 'אין משימות שמחכות לך כרגע.'}</p></div></section><div className="child-grid"><section className="section-card"><div className="section-heading"><div><span className="section-kicker">הלוח האישי</span><h2>היום שלך</h2></div></div>{today.length ? today.map(event => <div className="child-event" key={event.id}><span>{event.icon}</span><div><strong>{event.time} · {event.title}</strong><small>{event.departureTime ? `יוצאים ב־${event.departureTime} · ` : ''}{event.responsibleId && event.responsibleId !== person?.id ? `${name(event.responsibleId)} אחראי/ת · ${event.details}` : event.details}{event.sourceNote ? ' · ' + event.sourceNote : ''}</small></div></div>) : <Empty text="אין אירועים בתוכנית שלך היום."/>}</section><section className="section-card"><div className="section-heading"><div><span className="section-kicker">אל תשכח/י</span><h2>המשימות שלי</h2></div><button className="text-link" onClick={onTasks}>לכל המשימות <ArrowLeft size={15}/></button></div>{reminders.length ? reminders.slice(0, 4).map(task => <div className="child-event" key={task.id}><span>☑️</span><div><strong>{task.title}{task.repeatDays?.length ? ' · חוזר מדי שבוע' : ''}</strong><small>{dateLabel(task.due)}</small></div></div>) : <Empty text="אין תזכורות פתוחות."/>}</section><section className="section-card"><div className="section-heading"><div><span className="section-kicker">נעים לדעת</span><h2>ההסעות שלי</h2></div></div>{rides.length ? rides.map(request => { const event = data.events.find(item => item.id === request.eventId); return <div className="child-event" key={request.id}><span>🚗</span><div><strong>{event?.title || 'הסעה'} · {event?.time}</strong><small>{request.selectedDriverId ? `${name(request.selectedDriverId)} אוסף/ת אותך` : request.status === 'UNRESOLVED' ? 'עדיין מחפשים פתרון להסעה' : 'המשפחה מתאמת את ההסעה'}</small></div></div> }) : <Empty text="אין בקשות הסעה שקשורות אליך."/>}</section><section className="section-card"><div className="section-heading"><div><span className="section-kicker">בקרוב</span><h2>כדאי שתדע/י</h2></div></div>{upcoming.length ? upcoming.map(event => <div className="child-event" key={event.id}><span>{event.icon}</span><div><strong>{event.title}</strong><small>{dateLabel(event.date)} · {event.time}{event.sourceNote ? ' · ' + event.sourceNote : ''}</small></div></div>) : <Empty text="אין אירועים נוספים בקרוב."/>}</section></div></div>
}
function AlternativeReview({ requestId, data, onClose, onConfirm }: { requestId: string; data: AppData; onClose: () => void; onConfirm: () => void }) {
  const request = data.transportationRequests.find(item => item.id === requestId)
  const event = data.events.find(item => item.id === request?.eventId)
  const alternative = request && alternativeForRequest(data, request)
  if (!request || !event || !alternative) return <Empty text="הבקשה כבר עודכנה. אפשר לחזור למסך הבית."/>
  return <><ModalHeading title="נבדוק תוכנית חלופית" description={`${event.title} · ${dateLabel(event.date)} בשעה ${event.time}`}/><div className="plan-list"><div><span>⚠️</span><strong>כרגע אין נהג/ת להסעה</strong><small>התשובות הקודמות לא מאפשרות שיבוץ.</small></div><div><span>✨</span><strong>{alternative.title}</strong><small>{alternative.reason}</small></div><div><span>🔔</span><strong>נדרשת תשובה חדשה</strong><small>התוכנית תשתנה, אבל אף אדם לא ישובץ ללא אישור מצידו.</small></div></div><p className="permission-line"><ShieldCheck size={15}/> השינוי מקומי בלבד; אין הודעות אמיתיות.</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>השארת התוכנית</button><button className="dark-button" onClick={onConfirm}>החלת החלופה <ArrowLeft size={16}/></button></div></>
}
function WithdrawReview({ requestId, data, onClose, onConfirm }: { requestId: string; data: AppData; onClose: () => void; onConfirm: () => void }) {
  const request = data.transportationRequests.find(item => item.id === requestId)
  const event = data.events.find(item => item.id === request?.eventId)
  if (!request || !event) return <Empty text="הבקשה כבר אינה זמינה."/>
  const family = data.families.find(item => item.id === request.familyId)
  const passenger = family?.people.find(person => person.id === request.passengerId)
  const next = family?.people.find(person => person.id !== request.selectedDriverId && request.responses[person.id] === 'CAN_DO')
  return <><ModalHeading title="מה יקרה אם לא תוכל/י להסיע?" description={event.title}/><div className="plan-list"><div><span>🚗</span><strong>{passenger?.name || 'בן המשפחה'} יישאר/תישאר ללא נהג/ת משובץ/ת</strong><small>{dateLabel(event.date)} · {event.time}{event.sourceNote ? ' · ' + event.sourceNote : ''}</small></div><div><span>👥</span><strong>{next ? `${next.name} כבר השיב/ה שיכול/ה` : 'המשפחה תצטרך למצוא חלופה'}</strong><small>{next ? 'אפשר יהיה לאשר את השיבוץ שלו/ה לאחר הביטול.' : 'הבקשה תיפתח מחדש לנהגים כשירים; אם כולם סירבו, יופיע מצב ללא פתרון.'}</small></div></div><p className="permission-line"><ShieldCheck size={15}/> שום נהג/ת חלופי/ת לא ישובץ/תשובץ אוטומטית.</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>להישאר אחראי/ת</button><button className="dark-button" onClick={onConfirm}>ביטול האחריות ופתיחת הבקשה <ArrowLeft size={16}/></button></div></>
}
function ActivityFeed({ data, family }: { data: AppData; family: FamilyUnit }) {
  const entries = activityFeed(data, family.id)
  const names = new Map(family.people.map(person => [person.id, person.name]))
  return <section className="section-card family-feed"><div className="section-heading"><div><span className="section-kicker">הפעילות במשפחה</span><h2>מה קרה היום</h2></div></div>{entries.length ? <div className="feed-list">{entries.slice(0, 5).map(entry => <div className="feed-row" key={entry.id}><time dateTime={entry.createdAt}>{new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(entry.createdAt))}</time><div><strong>{integrationDisplayText(entry.text)}</strong><small>{entry.source === 'family' ? 'אוטופיילוט משפחתי' : entry.source ? integrationNames[entry.source] : names.get(entry.personId || '') || 'המשפחה'}</small></div></div>)}</div> : <Empty text="עדיין לא היו עדכונים היום."/>}</section>
}
function PersonalFocus({ person, events, tasks, requests, unresolved, onTask }: { person?: Person; events: FamilyEvent[]; tasks: FamilyTask[]; requests: TransportationRequest[]; unresolved: number; onTask: () => void }) {
  const child = !!person && person.age < 18
  const today = events.filter(event => event.date === localDate())
  const openTasks = tasks.filter(task => !task.done)
  return <div className="personal-focus"><div><span className="section-kicker">{child ? 'היום שלך' : 'צריך אותך'}</span><strong>{child ? `${today.length} דברים בתוכנית שלך` : requests.length ? `${requests.length} ${requests.length === 1 ? 'בקשת הסעה ממתינה' : 'בקשות הסעה ממתינות'} לתשובתך` : unresolved ? `${unresolved} הסעות ללא פתרון` : openTasks.length ? `${openTasks.length} משימות מחכות לך` : 'אין בקשות שממתינות לך'}</strong><small>{child ? 'אירועים ומשימות שקשורים אליך מופיעים בהמשך.' : requests.length ? 'אפשר להשיב בהמשך הדף; התשובה תופיע לכל המשפחה.' : 'השינויים בתוכנית המשפחתית מתעדכנים כאן.'}</small></div><div><span className="section-kicker">{child ? 'המשימות שלי' : 'ההשפעה שלי'}</span><strong>{openTasks.length} משימות פתוחות · {today.length} אירועים היום</strong><button className="text-link" onClick={onTask}>למשימות שלי <ArrowLeft size={15}/></button></div></div>
}
function RequestBoard({ requests, data, actorId, onRespond, onConfirm, onAlternative, onWithdraw, onTransit }: { requests: TransportationRequest[]; data: AppData; actorId: string; onRespond: (id: string, response: 'CAN_DO' | 'CANNOT_DO') => void; onConfirm: (id: string, driverId: string) => void; onAlternative: (id: string) => void; onWithdraw: (id: string) => void; onTransit: (id: string) => void }) {
  const [explanation, setExplanation] = useState<string | null>(null)
  const names = new Map(data.families.flatMap(f => f.people.map(p => [p.id, p.name] as const)))
  if (!requests.length) return null
  return <section className="section-card request-board"><div className="section-heading"><div><span className="section-kicker">תיאום משותף</span><h2>בקשות הסעה במשפחה</h2></div><span className="count-badge">{requests.filter(r => r.status !== 'COVERED').length}</span></div><div className="request-grid">{requests.map(request => {
    const event = data.events.find(item => item.id === request.eventId)
    if (!event) return null
    const recommendation = recommendDriver(data, request)
    const alternatives = rankedDrivers(data, request).slice(1, 3)
    const transit = transitAlternative(data, request)
    const pending = request.status !== 'COVERED' && request.responses[actorId] === 'PENDING' && request.eligibleMemberIds.includes(actorId)
    const answer = request.responses[actorId]
    const status = request.status === 'COVERED' ? 'יש נהג/ת' : request.status === 'UNRESOLVED' ? 'עדיין אין פתרון' : recommendation ? 'ממתין לאישור נהג/ת' : 'ממתינים לתשובות'
    return <article className="request-card" key={request.id}><div className="request-top"><span className="request-icon">🚗</span><span className={`request-status ${request.status.toLowerCase()}`}>{status}</span></div><h3>{event.title}</h3><p>{dateLabel(event.date)} · {event.time} · עבור {names.get(request.passengerId) || 'בן משפחה'}</p><div className="response-list">{request.eligibleMemberIds.map(id => <span key={id}>{names.get(id)}: {request.responses[id] === 'CAN_DO' ? 'יכול/ה' : request.responses[id] === 'CANNOT_DO' ? 'לא יכול/ה' : 'טרם השיב/ה'}</span>)}</div>{pending && <div className="request-actions"><strong>אפשר לסמוך עליך להסעה?</strong><button className="dark-button" onClick={() => onRespond(request.id, 'CAN_DO')}>יכול/ה <Check size={15}/></button><button className="secondary-button" onClick={() => onRespond(request.id, 'CANNOT_DO')}>לא יכול/ה</button></div>}{answer && answer !== 'PENDING' && <small className="my-answer">התשובה שלך: {answer === 'CAN_DO' ? 'יכול/ה' : 'לא יכול/ה'} {(request.status !== 'COVERED' || request.selectedDriverId === actorId) && <button onClick={() => request.status === 'COVERED' ? onWithdraw(request.id) : onRespond(request.id, answer === 'CAN_DO' ? 'CANNOT_DO' : 'CAN_DO')}>{request.status === 'COVERED' ? 'אני כבר לא יכול/ה' : 'שינוי תשובה'}</button>}</small>}{recommendation && request.status !== 'COVERED' && <div className="recommendation"><strong>ההמלצה: {recommendation.person.name}</strong><button onClick={() => setExplanation(explanation === request.id ? null : request.id)}>למה?</button>{explanation === request.id && <p>{recommendation.reason}</p>}<button className="dark-button" onClick={() => onConfirm(request.id, recommendation.person.id)}>אישור השיבוץ <ArrowLeft size={15}/></button>{alternatives.length > 0 && <div className="ride-alternatives"><small>חלופות</small>{alternatives.map(option => <details key={option.person.id}><summary>{option.person.name} יכול/ה להסיע</summary><p>{option.reason}</p><button className="secondary-button" onClick={() => onConfirm(request.id, option.person.id)}>בחירת {option.person.name}</button></details>)}</div>}{transit && <div className="ride-alternatives"><details><summary>{transit.title}</summary><p>{transit.reason}</p><button className="secondary-button" onClick={() => onTransit(request.id)}>אישור הגעה עצמאית</button></details></div>}</div>}{transit && !recommendation && request.status !== 'COVERED' && <div className="ride-alternatives"><strong>{transit.title}</strong><p>{transit.reason}</p><button className="secondary-button" onClick={() => onTransit(request.id)}>אישור הגעה עצמאית</button></div>}{request.status === 'COVERED' && <p className="covered-note">{names.get(request.selectedDriverId)} אחראי/ת להסעה. האירוע מופיע בתוכנית האישית שלו/ה.</p>}{request.status === 'UNRESOLVED' && <p className="unresolved-note">כל הנהגים הכשירים סירבו או שאינם זמינים. אפשר לשנות זמינות או להוסיף נהג/ת כשיר/ה ולבקש שוב; כדאי לתאם הסעה חלופית מחוץ לאפליקציה.</p>}{request.status === 'UNRESOLVED' && !!alternativeForRequest(data, request) && (data.families.find(f => f.id === request.familyId)?.people.find(p => p.id === actorId)?.age || 0) >= 18 && <button className="secondary-button" onClick={() => onAlternative(request.id)}>✨ הצג פתרון אפשרי</button>}</article>
  })}</div></section>
}
function ScopeSwitch({ value, onChange }: { value: 'mine' | 'family'; onChange: (value: 'mine' | 'family') => void }) { return <div className="scope-switch"><button className={value === 'mine' ? 'selected' : ''} onClick={() => onChange('mine')}>שלי</button><button className={value === 'family' ? 'selected' : ''} onClick={() => onChange('family')}>כל המשפחה</button></div> }
function EventRow({ event, people, onEdit }: { event: FamilyEvent; people: string; onEdit: () => void }) { return <button className="event-row" onClick={onEdit} aria-label={`פרטי אירוע: ${event.title}`}><time className="event-time" dateTime={event.time}>{event.time}</time><span className="event-line"/><span className="event-icon" aria-hidden="true">{event.icon}</span><span className="event-info"><strong>{event.title}</strong><small>{people || 'כל המשפחה'}{event.requiresDriver && <span className="item-badge">הסעה</span>}{event.sourceNote && <span className="source-badge">{event.sourceNote}</span>}</small></span><Pencil size={14}/></button> }
function TaskRow({ task, owner, onToggle, onEdit }: { task: FamilyTask; owner?: string; onToggle: () => void; onEdit: () => void }) { return <div className={`task-row ${task.done ? 'is-done' : ''}`}><button className="task-check" onClick={onToggle} aria-label={task.done ? 'סימון כלא בוצע' : 'סימון כבוצע'}>{task.done && <Check size={15}/>}</button><div><strong>{task.title}{task.repeatDays?.length ? ' · חוזר מדי שבוע' : task.routineId ? ' · הכנה קבועה' : ''}</strong><small>{dateLabel(task.due)}{owner ? ` · ${owner}` : ''}</small></div><button className="row-edit" onClick={onEdit} aria-label={`עריכת ${task.title}`}><Pencil size={15}/></button></div> }

function PlanReview({ dialog, data, family, actorId, impact, onClose, onConfirm }: {
  dialog: Extract<NonNullable<Dialog>, { type: 'plan' }>; data: AppData; family: FamilyUnit; actorId: string;
  impact: ReturnType<typeof getLateImpact>; onClose: () => void; onConfirm: () => void
}) {
  if (dialog.scenario === 'reminder') {
    const recipient = family.people.find(person => dialog.input.includes(`ל${person.name}`) || dialog.input.includes(`ל־${person.name}`)) || family.people.find(person => person.id === actorId)
    const title = reminderTitle(dialog.input, recipient)
    return <><ModalHeading title="תזכורת חדשה" description={`עבור ${recipient?.name || 'הפרופיל הנוכחי'}`}/><div className="plan-list"><div><span>🔔</span><strong>{title}</strong><small>{/מחר/.test(dialog.input) ? 'מחר' : 'היום'} · תופיע במשימות האישיות</small><Check size={15}/></div></div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>ביטול</button><button className="dark-button" disabled={!recipient} onClick={onConfirm}>יצירת התזכורת <ArrowLeft size={16}/></button></div></>
  }
  if (dialog.scenario === 'birthday') {
    const plan = prepareBirthdayPlan(data, family, actorId, dialog.input)
    const steps = [
      ['📅', plan.title, `${dateLabel(plan.date)} · ${plan.time}${plan.child ? ` · ${plan.child.name}` : ''}`],
      ...(plan.child ? [['🚗', 'בקשת הסעה משותפת', 'נהגים כשירים יוכלו להשיב; השיבוץ ייקבע לאחר אישור']] : []),
      ...(plan.needsCake ? [['🎂', 'קניית עוגה', `משימה עבור ${plan.cakeOwner?.name || 'אדם שייבחר בהמשך'}`]] : []),
    ]
    return <><ModalHeading title="הכנתי תוכנית ליום ההולדת" description="התוכנית נבנתה לפי בני המשפחה והפרטים שכתבת."/><div className="plan-list">{steps.map(([icon, title, detail]) => <div key={title}><span>{icon}</span><strong>{title}</strong><small>{detail}</small><Check size={15}/></div>)}</div>{plan.duplicate && <p className="plan-warning">האירוע הזה כבר קיים בלוח המשפחתי, ולכן הוא לא יתווסף פעמיים.</p>}{!actorId && <p className="plan-warning">צריך להוסיף בן משפחה לפני שאפשר לאשר תוכנית.</p>}<p className="permission-line"><ShieldCheck size={15}/> הכול נשמר מקומית בלבד. לא נשלחות הודעות.</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>ביטול</button><button className="dark-button" disabled={plan.duplicate || !actorId} onClick={onConfirm}>אישור התוכנית <ArrowLeft size={16}/></button></div></>
  }
  const steps = [
    ...(impact.pickup ? [['🚗', impact.pickup.title, impact.replacement ? `בקשה תישלח לנהגים פנויים, כולל ${impact.replacement.name}` : 'תיפתח בקשה ללא נהג כשיר; יהיה צורך בחלופה']] : []),
    ...(impact.groceries.length ? [['🛒', 'קניות לבית', `${impact.groceries.length} משימות יעברו למחר`]] : []),
    ...(impact.dinner ? [['🍽️', 'ארוחת הערב', 'שעת ההגעה שלך תסומן כמאוחרת יותר']] : []),
  ]
  return <><ModalHeading title="בדקתי מה השינוי משפיע" description="רק פריטים שמצאתי בתוכנית הנוכחית יופיעו כאן."/>{steps.length ? <div className="plan-list">{steps.map(([icon, title, detail]) => <div key={title}><span>{icon}</span><strong>{title}</strong><small>{detail}</small><Check size={15}/></div>)}</div> : <Empty text="לא מצאתי אירועים או משימות שדורשים שינוי היום."/>}{impact.blocked && <p className="plan-warning">האיסוף דורש מחליף, אבל אין בתא המשפחתי מבוגר אחר. הוסיפו בן משפחה או ערכו את האירוע לפני אישור.</p>}<p className="permission-line"><ShieldCheck size={15}/> לא יתבצע שינוי בשירותים חיצוניים.</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>סגירה</button><button className="dark-button" disabled={!impact.hasChanges || impact.blocked} onClick={onConfirm}>החלת התוכנית <ArrowLeft size={16}/></button></div></>
}

export default App
