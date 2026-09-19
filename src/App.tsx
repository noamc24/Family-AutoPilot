import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ClipboardList, Home, Mic, MoreHorizontal, Pencil, Plus, Settings2, ShieldCheck, Sparkles, Trash2, Users, X } from 'lucide-react'
import { dateLabel, detectScenario, initialData, localDate, readData, removePersonAndTheirData, sanitizeAppData, uid, type AppData, type FamilyEvent, type FamilyTask, type FamilyUnit, type Person, type TransportationRequest } from './data'
import { applyBirthdayPlan, applyLatePlan, canDrive, drivingIneligibility, getLateImpact, pickupIneligibility, prepareBirthdayPlan, removeEventAndDependents, saveEventAndDependents, updatePersonAndRevalidate } from './domain'
import { confirmDriver, ensureRequests, reconcileTransportation, recommendDriver, requestForEvent, respondToRequest } from './coordination'

type View = 'home' | 'events' | 'family' | 'tasks' | 'assistant' | 'more'
type Dialog = { type: 'event'; item?: FamilyEvent } | { type: 'task'; item?: FamilyTask } | { type: 'person'; item?: Person } | { type: 'family'; item?: FamilyUnit } | { type: 'plan'; scenario: 'birthday' | 'late' | 'reminder'; input: string } | { type: 'resolve'; item: FamilyEvent } | { type: 'unknown' } | null
const navigation = [
  { id: 'home', label: 'בית', icon: Home }, { id: 'family', label: 'משפחה', icon: Users },
  { id: 'tasks', label: 'משימות', icon: ClipboardList }, { id: 'assistant', label: 'עוזר', icon: Sparkles },
  { id: 'more', label: 'עוד', icon: MoreHorizontal },
] as const
const palette = ['peach', 'sage', 'lavender', 'butter']
function reminderTitle(input: string, recipient?: Person) {
  const text = input.replace(/^.*?תזכיר(?:י)?\s+/, '')
  const prefix = recipient ? `(?:לי|ל־?${recipient.name})` : 'לי'
  return text.replace(new RegExp(`^${prefix}\\s*`), '').trim() || 'תזכורת אישית'
}

function App() {
  const [data, setData] = useState<AppData>(() => ensureRequests(readData(), 'maya'))
  const [familyId, setFamilyId] = useState(() => localStorage.getItem('family-autopilot-family') || 'cohen')
  const [personId, setPersonId] = useState(() => localStorage.getItem('family-autopilot-person') || 'maya')
  const [view, setView] = useState<View>('home')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [prompt, setPrompt] = useState('')
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState('')
  const [familyMenu, setFamilyMenu] = useState(false)
  const [profileMenu, setProfileMenu] = useState(false)
  const [listScope, setListScope] = useState<'mine' | 'family'>('mine')
  const [form, setForm] = useState<Record<string, string>>({})
  const [participants, setParticipants] = useState<string[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const family = data.families.find(f => f.id === familyId) || data.families[0]
  const currentPerson = family.people.find(p => p.id === personId) || family.people[0]
  const activePersonId = currentPerson?.id || ''
  const childMode = !!currentPerson && currentPerson.age < 18
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
  const attentionCount = attention.length + attentionTasks.length + actionableRequests.length + unresolvedRequests.length
  const recent = data.activity.filter(a => a.familyId === family.id && (a.personIds.length === 0 || a.personIds.includes(activePersonId))).slice(0, 4)
  const lateImpact = getLateImpact(data, family, activePersonId)

  useEffect(() => {
    const clean = ensureRequests(sanitizeAppData(data), activePersonId)
    if (JSON.stringify(clean) !== JSON.stringify(data)) setData(clean)
    else localStorage.setItem('family-autopilot-he-v1', JSON.stringify(data))
  }, [data])
  useEffect(() => { localStorage.setItem('family-autopilot-family', family.id); localStorage.setItem('family-autopilot-person', activePersonId) }, [family.id, activePersonId])
  useEffect(() => { if (toast) { const timeout = window.setTimeout(() => setToast(''), 3800); return () => clearTimeout(timeout) } }, [toast])

  function log(text: string, personIds: string[] = []) { return { id: uid(), familyId: family.id, text, personIds } }
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
  function changeFamily(id: string) {
    const next = data.families.find(f => f.id === id)
    if (!next) return
    setFamilyId(id); setPersonId(next.people[0]?.id || ''); setFamilyMenu(false); setProfileMenu(false); setView('home')
  }
  function openEvent(item?: FamilyEvent) {
    setForm(item ? { title: item.title, date: item.date, time: item.time, icon: item.icon, responsibleId: item.responsibleId, details: item.details, requiresDriver: item.requiresDriver ? 'true' : 'false' } : { title: '', date: localDate(), time: '17:00', icon: '📅', responsibleId: '', details: '', requiresDriver: 'false' })
    setParticipants(item?.participantIds || (activePersonId ? [activePersonId] : [])); setDialog({ type: 'event', item })
  }
  function openTask(item?: FamilyTask) { setForm(item ? { title: item.title, due: item.due, ownerId: item.ownerId, requiresAdult: item.requiresAdult ? 'true' : 'false' } : { title: '', due: localDate(), ownerId: activePersonId, requiresAdult: 'false' }); setDialog({ type: 'task', item }) }
  function openPerson(item?: Person) { setForm(item ? { name: item.name, role: item.role, color: item.color, age: String(item.age), hasLicense: String(item.hasLicense), hasCar: String(item.hasCar), availableForPickup: String(item.availableForPickup), availability: item.availability || 'available', unavailableUntil: item.unavailableUntil || '' } : { name: '', role: 'בן', color: palette[family.people.length % palette.length], age: '', hasLicense: 'false', hasCar: 'false', availableForPickup: 'false', availability: 'available', unavailableUntil: '' }); setDialog({ type: 'person', item }) }
  function openFamily(item?: FamilyUnit) { setForm({ name: item?.name || '' }); setDialog({ type: 'family', item }) }
  function updateForm(key: string, value: string) { setForm(previous => ({ ...previous, [key]: value })) }

  function saveForm() {
    if (!dialog) return
    if (dialog.type === 'event') {
      if (!form.title?.trim() || !form.date || !form.time || !participants.length) return
      const requiresDriver = form.requiresDriver === 'true'
       const event: FamilyEvent = { id: dialog.item?.id || uid(), familyId: family.id, title: form.title.trim(), date: form.date, time: form.time, icon: form.icon || '📅', participantIds: participants, responsibleId: requiresDriver ? (dialog.item?.responsibleId || '') : form.responsibleId || '', details: form.details?.trim() || '', requiresDriver, needsAttention: requiresDriver && !dialog.item?.responsibleId }
       setData(previous => {
         const next = saveEventAndDependents(previous, event)
         const changedTime = dialog.item && (dialog.item.date !== event.date || dialog.item.time !== event.time)
         const transportationRequests = changedTime ? next.transportationRequests.map(request => request.eventId === event.id ? { ...request, selectedDriverId: '', status: 'OPEN' as const, responses: Object.fromEntries(request.eligibleMemberIds.map(id => [id, 'PENDING' as const])) } : request) : next.transportationRequests
         return ensureRequests({ ...next, transportationRequests, events: changedTime && event.requiresDriver ? next.events.map(item => item.id === event.id ? { ...item, responsibleId: '', needsAttention: true } : item) : next.events, activity: [log(`${dialog.item ? 'עודכן' : 'נוסף'} אירוע: ${event.title}`, [activePersonId]), ...next.activity] }, activePersonId)
       })
      setToast(dialog.item ? 'האירוע עודכן' : 'האירוע נוסף ללוח')
    } else if (dialog.type === 'task') {
      if (!form.title?.trim() || !form.due) return
      const owner = family.people.find(person => person.id === form.ownerId)
      if (form.requiresAdult === 'true' && owner && owner.age < 18) { setToast('המשימה הזו חייבת להיות משויכת למבוגר'); return }
      const task: FamilyTask = { id: dialog.item?.id || uid(), familyId: family.id, title: form.title.trim(), ownerId: form.ownerId || '', due: form.due, done: dialog.item?.done || false, eventId: dialog.item?.eventId, requiresAdult: form.requiresAdult === 'true' }
      setData(previous => ({ ...previous, tasks: dialog.item ? previous.tasks.map(t => t.id === task.id ? task : t) : [...previous.tasks, task] }))
      setToast(dialog.item ? 'המשימה עודכנה' : 'המשימה נוספה')
    } else if (dialog.type === 'person') {
      const age = Number(form.age)
      if (!form.name?.trim() || !Number.isInteger(age) || age < 0 || age > 120 || form.age === '') return
      const adult = age >= 18
       const person: Person = { id: dialog.item?.id || uid(), name: form.name.trim(), role: (['אב', 'אם', 'בן', 'בת'].includes(form.role) ? form.role : 'בן') as Person['role'], color: form.color || 'sage', age, hasLicense: adult && form.hasLicense === 'true', hasCar: adult && form.hasCar === 'true', availableForPickup: adult && form.availableForPickup === 'true', availability: (form.availability || 'available') as Person['availability'], unavailableUntil: form.unavailableUntil || '' }
       if (dialog.item) {
         const affected = data.events.filter(event => event.familyId === family.id && event.requiresDriver && event.responsibleId === person.id && !!pickupIneligibility(person, event, data))
         const pending = data.transportationRequests.filter(request => request.familyId === family.id && request.eligibleMemberIds.includes(person.id) && request.responses[person.id] === 'PENDING').length
         if ((affected.length || pending) && !window.confirm(`השינוי ישפיע על ${affected.length} הסעות משובצות ועל ${pending} בקשות פתוחות. ${affected.length ? 'ההסעות ייפתחו מחדש למשפחה. ' : ''}להמשיך?`)) return
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
    const linkedTasks = data.tasks.filter(task => task.eventId === item.id).length
    if (!window.confirm(`למחוק את האירוע ״${item.title}״${linkedTasks ? ` ואת ${linkedTasks} המשימות שנוצרו בעקבותיו` : ''}?`)) return
    setData(previous => removeEventAndDependents(previous, item.id)); setDialog(null); setToast('האירוע והמשימות התלויות בו נמחקו')
  }
  function removeTask(item: FamilyTask) {
    if (!window.confirm(`למחוק את המשימה ״${item.title}״?`)) return
    setData(previous => ({ ...previous, tasks: previous.tasks.filter(t => t.id !== item.id) })); setDialog(null); setToast('המשימה נמחקה')
  }
  function removePerson(item: Person) {
    const removedEvents = data.events.filter(event => event.familyId === family.id && (event.responsibleId === item.id || event.participantIds.includes(item.id)))
    const eventCount = removedEvents.length
    const removedIds = new Set(removedEvents.map(event => event.id))
    const taskCount = data.tasks.filter(task => task.familyId === family.id && (task.ownerId === item.id || removedIds.has(task.eventId || ''))).length
    if (!window.confirm(`להסיר את ${item.name}? יחד איתו/ה יימחקו ${eventCount} אירועים (גם משותפים) ו־${taskCount} משימות המשויכים אליו/ה.`)) return
    setData(previous => removePersonAndTheirData(previous, family.id, item.id))
    if (activePersonId === item.id) setPersonId(family.people.find(p => p.id !== item.id)?.id || '')
    setDialog(null); setToast('בן המשפחה והפריטים המשויכים אליו/ה הוסרו')
  }
  function removeFamily(item: FamilyUnit) {
    if (data.families.length === 1) { setToast('צריך להשאיר לפחות תא משפחתי אחד'); return }
    if (!window.confirm(`למחוק את ״${item.name}״ ואת כל האירועים והמשימות שלו?`)) return
    const next = data.families.find(f => f.id !== item.id)!
     setData(previous => ({ families: previous.families.filter(f => f.id !== item.id), events: previous.events.filter(e => e.familyId !== item.id), tasks: previous.tasks.filter(t => t.familyId !== item.id), activity: previous.activity.filter(a => a.familyId !== item.id), transportationRequests: previous.transportationRequests.filter(r => r.familyId !== item.id) }))
    setFamilyId(next.id); setPersonId(next.people[0]?.id || ''); setDialog(null); setView('home'); setToast('התא המשפחתי נמחק')
  }
  function toggleTask(item: FamilyTask) { setData(previous => ({ ...previous, tasks: previous.tasks.map(t => t.id === item.id ? { ...t, done: !t.done } : t) })) }
  function sendPrompt(value = prompt) {
    if (!value.trim() || processing) return
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

  const inputArea = <section className="ask-card"><div className="ask-title"><span className="spark-icon"><Sparkles size={19}/></span><div><h2>מה קורה אצלכם?</h2><p>ספרו לי מה השתנה, ואני אדאג לפרטים.</p></div></div><div className="input-wrap"><textarea ref={inputRef} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt() } }} placeholder="אפשר לספר לי כל דבר..." aria-label="עדכון למשפחה"/><button className="mic" title="הקלטה חזותית בלבד" onClick={() => setToast('הקלדה זמינה כעת. הקלטה היא להמחשה בלבד.')} aria-label="מיקרופון להמחשה"><Mic size={18}/></button><button className="submit" disabled={!prompt.trim() || processing} onClick={() => sendPrompt()} aria-label="שליחת עדכון"><ArrowLeft size={18}/></button></div><div className="examples"><span>אפשר לנסות</span><button onClick={() => example('ליובל יש ביום חמישי יום הולדת לדניאל בשעה 17:00 וצריך להביא עוגה')}>🎂 לתכנן יום הולדת</button><button onClick={() => example('אני תקועה בעבודה ואגיע הביתה שעה מאוחר יותר')}>↗ שינוי בתוכניות</button></div></section>

  return <div className="app-shell" dir="rtl">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Sparkles size={19}/></span><span>אוטופיילוט <b>משפחתי</b><small>הבית שלכם, מסונכרן</small></span></div><div className="side-label">המרחב שלך</div><nav className="side-nav" aria-label="ניווט ראשי">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${(view === id || (view === 'events' && id === 'home')) ? 'active' : ''}`} onClick={() => setView(id)}><Icon size={19}/>{label}{id === 'home' && attentionCount > 0 && <i className="nav-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="connected-mini"><span className="online-dot"/> כל הפעולות מדומות ונשמרות בדפדפן</div><button className="family-switch" onClick={() => setFamilyMenu(!familyMenu)}><span className="avatar sage">⌂</span><span><strong>{family.name}</strong><small>{family.people.length} בני משפחה</small></span><ChevronDown size={15}/></button>{familyMenu && <div className="switch-menu side-menu">{data.families.map(f => <button key={f.id} onClick={() => changeFamily(f.id)}>{f.name} {f.id === family.id && <Check size={15}/>}</button>)}<button className="menu-add" onClick={() => { setFamilyMenu(false); openFamily() }}><Plus size={15}/> תא משפחתי חדש</button></div>}</div></aside>
    <div className="main-column"><header className="topbar"><div className="topbar-family"><span className="mobile-logo"><Sparkles size={17}/> אוטופיילוט משפחתי</span><span className="desktop-date">{new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span></div><div className="topbar-actions"><span className="demo-pill"><span/> סביבת הדגמה</span><button className="top-family" onClick={() => setFamilyMenu(!familyMenu)}>{family.name}<ChevronDown size={14}/></button>{familyMenu && <div className="switch-menu top-menu">{data.families.map(f => <button key={f.id} onClick={() => changeFamily(f.id)}>{f.name} {f.id === family.id && <Check size={15}/>}</button>)}<button className="menu-add" onClick={() => { setFamilyMenu(false); openFamily() }}><Plus size={15}/> תא משפחתי חדש</button></div>}<div className="profile-wrap"><button className="profile-button" onClick={() => setProfileMenu(!profileMenu)} aria-label="מעבר בין בני משפחה"><span className={`avatar ${currentPerson?.color || 'sage'}`}>{currentPerson?.name.slice(0, 1) || '?'}</span><span><strong>{currentPerson?.name || 'בחרו אדם'}</strong><small>מחובר/ת בתצוגת הדגמה</small></span><ChevronDown size={14}/></button>{profileMenu && <div className="switch-menu profile-menu"><div className="menu-caption">התחברות מדומה בתור</div>{family.people.map(p => <button key={p.id} onClick={() => { setPersonId(p.id); setProfileMenu(false); setView('home') }}><span className={`avatar mini ${p.color}`}>{p.name.slice(0, 1)}</span><span>{p.name}<small>{p.role}</small></span>{activePersonId === p.id && <Check size={15}/>}</button>)}{!family.people.length && <p>הוסיפו בן משפחה כדי להתחיל</p>}<button className="menu-add" onClick={() => { setProfileMenu(false); setView('family'); openPerson() }}><Plus size={15}/> הוספת בן משפחה</button></div>}</div></div></header>
      <main className="content">{view === 'home' ? <><div className="welcome-row"><div><div className="eyebrow">התוכנית האישית <span/></div><h1>שלום {currentPerson?.name || 'משפחה'} <em>☀️</em></h1><p>הנה מה שחשוב לך היום ב־{family.name}.</p></div><div className="family-avatars">{family.people.map(p => <span title={p.name} key={p.id} className={`avatar ${p.color}`}>{p.name.slice(0, 1)}</span>)}</div></div><section className={`pulse-card ${attentionCount ? '' : 'covered'}`}><div className="pulse-icon">{attentionCount ? <Sparkles size={25}/> : <CheckCircle2 size={25}/>}</div><div className="pulse-copy"><span className="pulse-kicker">תמונת המצב שלך</span><h2>{attentionCount ? `${attentionCount} ${attentionCount === 1 ? 'דבר שדורש' : 'דברים שדורשים'} תשומת לב` : 'הכול מסודר עבורך'}</h2><p>{attentionCount ? 'מצאתי תוכנית שעדיין חסרה בה החלטה. אפשר לפתור אותה כאן.' : 'כל האירועים שלך מכוסים כרגע. אפשר להמשיך את היום בשקט.'}</p><div className="pulse-meta"><span><CalendarDays size={15}/> {todayEvents.length} אירועים היום</span><span><CheckCircle2 size={15}/> {myTasks.filter(t => !t.done).length} משימות פתוחות</span><span><Users size={15}/> {family.people.length} בני משפחה</span></div></div>{attentionCount > 0 && <button className="pulse-action" onClick={() => document.querySelector(actionableRequests.length || unresolvedRequests.length ? '.request-board' : '#attention')?.scrollIntoView({ behavior: 'smooth' })}>לטיפול <ArrowLeft size={16}/></button>}</section><PersonalFocus person={currentPerson} events={myEvents} tasks={myTasks} requests={actionableRequests} unresolved={unresolvedRequests.length} onTask={() => setView('tasks')}/>{inputArea}<RequestBoard requests={requests} data={data} actorId={activePersonId} onRespond={answerRide} onConfirm={approveRide}/><div className="dashboard-grid"><div className="left-stack"><section className="section-card"><div className="section-heading"><div><span className="section-kicker">מה בתוכנית</span><h2>בשבילך היום</h2></div><div className="heading-actions"><button className="text-link" onClick={() => setView('events')}>כל האירועים <ArrowLeft size={15}/></button><button className="text-link" onClick={() => openEvent()}><Plus size={16}/> אירוע</button></div></div>{todayEvents.length ? <div className="timeline">{todayEvents.map(e => <EventRow key={e.id} event={e} people={eventPeople(e)} onEdit={() => childMode ? setToast('אפשר לצפות באירוע; שינוי האירוע מתבצע בתצוגת מבוגר') : openEvent(e)}/>)}</div> : <Empty text="אין לך אירועים היום. אפשר להוסיף אירוע חדש."/>}</section><section className="section-card"><div className="section-heading"><div><span className="section-kicker">בקרוב</span><h2>בהמשך השבוע</h2></div><button className="text-link" onClick={() => openEvent()}><Plus size={16}/> הוספה</button></div>{upcoming.length ? <div className="upcoming-list">{upcoming.map(e => <button className="upcoming-row" key={e.id} onClick={() => openEvent(e)}><span className="upcoming-date">{dateLabel(e.date)}</span><span className="upcoming-emoji">{e.icon}</span><span><strong>{e.title}</strong><small>{e.time} · {eventPeople(e)}{e.details ? ` · ${e.details}` : ''}</small></span><Pencil size={14}/></button>)}</div> : <Empty text="אין אירועים נוספים בתוכנית שלך."/>}</section></div><div className="right-stack"><section className="attention-card" id="attention"><div className="section-heading"><div><span className="section-kicker">רק כשצריך החלטה</span><h2>צריך אותך</h2></div><span className="count-badge">{attentionCount}</span></div>{attentionCount ? <>{actionableRequests.map(r => <div className="issue-body" key={r.id}><span className="issue-icon">🚗</span><div><h3>בקשת הסעה ממתינה לתשובתך</h3><p>{data.events.find(e => e.id === r.eventId)?.title}</p><button className="dark-button" onClick={() => document.querySelector('.request-board')?.scrollIntoView({ behavior: 'smooth' })}>להשיב לבקשה <ArrowLeft size={15}/></button></div></div>)}{unresolvedRequests.map(r => <div className="issue-body" key={r.id}><span className="issue-icon">!</span><div><h3>אין פתרון להסעה</h3><p>{data.events.find(e => e.id === r.eventId)?.title} · נדרש תיאום חלופי</p><button className="dark-button" onClick={() => document.querySelector('.request-board')?.scrollIntoView({ behavior: 'smooth' })}>לפרטי הבקשה <ArrowLeft size={15}/></button></div></div>)}{attention.map(e => <div className="issue-body" key={e.id}><span className="issue-icon">!</span><div><h3>{e.title}</h3><p>{dateLabel(e.date)} ב־{e.time} · {e.details}</p><div className="solution-hint"><Sparkles size={15}/> אפשר לבחור מי אחראי</div><button className="dark-button" onClick={() => { setForm({ responsibleId: family.people.find(p => p.id !== activePersonId && !pickupIneligibility(p, e, data))?.id || family.people.find(p => !pickupIneligibility(p, e, data))?.id || '' }); setDialog({ type: 'resolve', item: e }) }}>לפתור עכשיו <ArrowLeft size={15}/></button></div></div>)}{attentionTasks.map(t => <div className="issue-body" key={t.id}><span className="issue-icon">!</span><div><h3>{t.title}</h3><p>אין אחראי/ת למשימה · {dateLabel(t.due)}</p><div className="solution-hint"><Sparkles size={15}/> נדרש שיוך לבן משפחה</div><button className="dark-button" onClick={() => openTask(t)}>שיוך משימה <ArrowLeft size={15}/></button></div></div>)}</> : <div className="resolved-state"><span className="resolved-icon"><Check size={19}/></span><strong>הכול מטופל</strong><p>אין כרגע החלטות פתוחות עבורך.</p></div>}</section><section className="section-card"><div className="section-heading"><div><span className="section-kicker">בתנועה שקטה</span><h2>כדאי שתדע ✨</h2></div></div>{recent.length ? <div className="activity-list">{recent.map(a => <div className="activity-row" key={a.id}><span className="activity-check"><Check size={13}/></span>{a.text}</div>)}</div> : <Empty text="פעילות משפחתית תופיע כאן אחרי העדכון הראשון."/>}</section><section className="section-card mini-tasks"><div className="section-heading"><div><span className="section-kicker">מה על הפרק</span><h2>המשימות שלי</h2></div><button className="text-link" onClick={() => setView('tasks')}>הכול <ArrowLeft size={15}/></button></div>{myTasks.slice(0, 3).map(t => <TaskRow key={t.id} task={t} onToggle={() => toggleTask(t)} onEdit={() => openTask(t)}/>)}{!myTasks.length && <Empty text="אין משימות שמשויכות אליך."/>}</section></div></div><div className="trust-note"><ShieldCheck size={16}/> ההתחברות, ההודעות והחיבורים לשירותים הם להמחשה בלבד. הנתונים נשמרים בדפדפן הזה.</div></> : view === 'events' ? <><div className="page-header"><div><div className="eyebrow">הלוח האישי שלך</div><h1>{listScope === 'mine' ? 'כל האירועים של ' + (currentPerson?.name || 'המשפחה') : 'כל האירועים של ' + family.name}</h1><p>אפשר לעדכן ולמחוק גם אירועים שלא מופיעים בתקציר הבית.</p></div><button className="dark-button" onClick={() => openEvent()}><Plus size={17}/> אירוע חדש</button></div><div className="section-card all-events"><ScopeSwitch value={listScope} onChange={setListScope}/>{(listScope === 'mine' ? myEvents : familyEvents).length ? (listScope === 'mine' ? myEvents : familyEvents).map(e => <div className="dated-event" key={e.id}><span>{dateLabel(e.date)}</span><EventRow event={e} people={eventPeople(e)} onEdit={() => childMode ? setToast('אפשר לצפות באירוע; שינוי האירוע מתבצע בתצוגת מבוגר') : openEvent(e)}/></div>) : <Empty text="אין אירועים בתצוגה הזו."/>}</div></> : view === 'family' ? <><div className="page-header"><div><div className="eyebrow">האנשים שמאחורי התוכנית</div><h1>המשפחה שלך</h1><p>נהלו תאים משפחתיים ואת האנשים בכל תא.</p></div><button className="light-button" onClick={() => openFamily()}><Plus size={17}/> תא משפחתי חדש</button></div><div className="family-tabs">{data.families.map(f => <button key={f.id} className={family.id === f.id ? 'selected' : ''} onClick={() => changeFamily(f.id)}>{f.name}</button>)}</div><div className="section-card family-management"><div className="section-heading"><div><span className="section-kicker">התא הנוכחי</span><h2>{family.name}</h2></div><div className="heading-actions"><button className="subtle-button" onClick={() => openFamily(family)}><Pencil size={15}/> שינוי שם</button><button className="subtle-button danger" onClick={() => removeFamily(family)}><Trash2 size={15}/> מחיקה</button></div></div><div className="person-grid">{family.people.map(p => <div className="person-card" key={p.id}><span className={`avatar large ${p.color}`}>{p.name.slice(0, 1)}</span><div><strong>{p.name}</strong><small>{p.role} · גיל {p.age}</small><small>{canDrive(p) ? 'יכול/ה להסיע' : drivingIneligibility(p)}</small></div>{p.id === activePersonId && <span className="you-badge">התצוגה שלך</span>}<div className="card-actions"><button onClick={() => openPerson(p)} aria-label={`עריכת ${p.name}`}><Pencil size={16}/></button><button onClick={() => removePerson(p)} aria-label={`הסרת ${p.name}`}><Trash2 size={16}/></button></div></div>)}<button className="add-card" onClick={() => openPerson()}><Plus size={21}/><strong>הוספת בן משפחה</strong><small>ייכלל בלוח ובשיוך משימות</small></button></div></div><div className="info-panel"><ShieldCheck size={19}/><span>מעבר בין אנשים נעשה דרך בורר הפרופיל למעלה. זוהי התחברות מדומה ללא סיסמה.</span></div></> : view === 'tasks' ? <><div className="page-header"><div><div className="eyebrow">אחריות משותפת</div><h1>{listScope === 'mine' ? 'המשימות של ' + (currentPerson?.name || 'המשפחה') : 'המשימות של ' + family.name}</h1><p>כאן מופיעות רק משימות ששויכו אליך ב־{family.name}.</p></div><button className="dark-button" onClick={() => openTask()}><Plus size={17}/> משימה חדשה</button></div><div className="section-card task-list"><div className="section-heading"><div><span className="section-kicker">לפי מועד</span><h2>משימות</h2></div></div><ScopeSwitch value={listScope} onChange={setListScope}/>{(listScope === 'mine' ? myTasks : familyTasks).sort((a, b) => a.due.localeCompare(b.due)).map(t => <TaskRow key={t.id} task={t} owner={listScope === 'family' ? personName(t.ownerId) : undefined} onToggle={() => toggleTask(t)} onEdit={() => openTask(t)}/>)}{(listScope === 'mine' ? myTasks : familyTasks).length === 0 && <Empty text="אין כאן משימות עדיין. אפשר ליצור אחת חדשה."/>}</div></> : view === 'assistant' ? <><div className="page-header"><div><div className="eyebrow">עדכון אחד, תוכנית מתואמת</div><h1>איך אפשר לעזור?</h1><p>דברו בשפה חופשית. העוזר מזהה תרחישי הדגמה ומכין תוכנית לאישורכם.</p></div></div>{inputArea}<div className="info-panel"><Sparkles size={19}/><span>אפשר לנסות תכנון יום הולדת או שינוי בגלל איחור בעבודה. הפעולות מדומות ומתעדכנות רק אחרי אישור.</span></div></> : <><div className="page-header"><div><div className="eyebrow">שליטה ושקיפות</div><h1>הכול בידיים שלכם</h1><p>אפשר לנהל את המידע המקומי ואת אופן ההדגמה.</p></div></div><div className="section-card preferences"><h2><Settings2 size={19}/> רמות פעולה</h2><div><strong>אוטומטי</strong><span>עדכונים בטוחים בתוך התוכנית המקומית</span></div><div><strong>לבקש קודם</strong><span>שינויים שמשפיעים על בן משפחה אחר</span></div><div><strong>אישור תמיד</strong><span>רכישות, תשלומים, תורים וביטולים</span></div></div><div className="section-card preferences"><h2><ShieldCheck size={19}/> חיבורים מדומים</h2><p>יומן, ניווט, הודעות, מזג אוויר, בית ספר וקניות מוצגים כאן כהמחשה בלבד. אין חיבור לחשבונות אמיתיים.</p></div><div className="section-card preferences"><h2>נתוני הדגמה</h2><p>החזרה להתחלה תמחק את השינויים המקומיים בכל התאים המשפחתיים בדפדפן הזה.</p><button className="secondary-button" onClick={() => { if (!window.confirm('לאפס את כל נתוני ההדגמה? השינויים המקומיים יימחקו.')) return; setData(ensureRequests(structuredClone(initialData), 'maya')); setFamilyId('cohen'); setPersonId('maya'); setView('home'); setToast('נתוני ההדגמה אופסו') }}>איפוס נתוני הדגמה</button></div></>}</main></div>
    <nav className="mobile-nav" aria-label="ניווט בנייד">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={(view === id || (view === 'events' && id === 'home')) ? 'active' : ''} onClick={() => setView(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>
    {(dialog || processing) && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !processing) setDialog(null) }}><div className="plan-modal" role="dialog" aria-modal="true" aria-label="חלון עריכה"><button className="modal-close" onClick={() => setDialog(null)} aria-label="סגירה"><X size={19}/></button>{processing ? <div className="processing"><span className="processing-orb"><Sparkles size={27}/></span><h2>מחברים את כל הפרטים...</h2><p>בודקים את לוח המשפחה, האחריות וזמני הנסיעה.</p><div className="processing-bar"><span/></div></div> : dialog?.type === 'event' ? <><ModalHeading title={dialog.item ? 'עריכת אירוע' : 'אירוע חדש'} description="מה קורה, מתי ולמי זה רלוונטי?"/><div className="form-grid"><Field label="שם האירוע"><input required value={form.title || ''} onChange={e => updateForm('title', e.target.value)} placeholder="למשל, חוג שחייה"/></Field><Field label="סמל"><input value={form.icon || ''} onChange={e => updateForm('icon', e.target.value)} maxLength={4}/></Field><Field label="תאריך"><input type="date" value={form.date || ''} onChange={e => updateForm('date', e.target.value)}/></Field><Field label="שעה"><input type="time" value={form.time || ''} onChange={e => updateForm('time', e.target.value)}/></Field><Field label="פרטי הגעה / הערה"><input value={form.details || ''} onChange={e => updateForm('details', e.target.value)} placeholder="למשל, נקודת מפגש וכתובת"/></Field></div><label className="rule-check"><input type="checkbox" checked={form.requiresDriver === 'true'} onChange={e => updateForm('requiresDriver', String(e.target.checked))}/> נדרשת הסעה · תיפתח בקשה לנהגים כשירים</label><div className="field-label">למי האירוע רלוונטי?</div><div className="checks">{family.people.map(p => <label key={p.id}><input type="checkbox" checked={participants.includes(p.id)} onChange={() => setParticipants(previous => previous.includes(p.id) ? previous.filter(id => id !== p.id) : [...previous, p.id])}/>{p.name}</label>)}</div><ModalActions onSave={saveForm} onDelete={dialog.item ? () => removeEvent(dialog.item!) : undefined} disabled={!form.title?.trim() || !form.date || !form.time || !participants.length}/></> : dialog?.type === 'task' ? <><ModalHeading title={dialog.item ? 'עריכת משימה' : 'משימה חדשה'} description="משימה ברורה, עם אחראי ומועד."/><div className="form-grid"><Field label="שם המשימה"><input value={form.title || ''} onChange={e => updateForm('title', e.target.value)} placeholder="מה צריך לעשות?"/></Field><Field label="עד מתי"><input type="date" value={form.due || ''} onChange={e => updateForm('due', e.target.value)}/></Field><Field label="אחראי/ת"><select value={form.ownerId || ''} onChange={e => updateForm('ownerId', e.target.value)}><option value="">ללא שיוך</option>{family.people.map(p => <option key={p.id} value={p.id} disabled={form.requiresAdult === 'true' && p.age < 18}>{p.name}{form.requiresAdult === 'true' && p.age < 18 ? ' · נדרש מבוגר' : ''}</option>)}</select></Field></div><label className="rule-check"><input type="checkbox" checked={form.requiresAdult === 'true'} onChange={e => updateForm('requiresAdult', String(e.target.checked))}/> המשימה דורשת מבוגר/ת</label><ModalActions onSave={saveForm} onDelete={dialog.item ? () => removeTask(dialog.item!) : undefined} disabled={!form.title?.trim() || !form.due}/></> : dialog?.type === 'person' ? <><ModalHeading title={dialog.item ? 'עריכת בן משפחה' : 'בן משפחה חדש'} description={`הפרטים שייכים ל־${family.name}.`}/><div className="form-grid"><Field label="שם"><input value={form.name || ''} onChange={e => updateForm('name', e.target.value)} placeholder="שם פרטי"/></Field><Field label="תפקיד במשפחה"><select value={form.role || 'בן'} onChange={e => updateForm('role', e.target.value)}><option value="אב">אב</option><option value="אם">אם</option><option value="בן">בן</option><option value="בת">בת</option></select></Field><Field label="גיל"><input type="number" min="0" max="120" value={form.age || ''} onChange={e => updateForm('age', e.target.value)} placeholder="גיל"/></Field><Field label="צבע פרופיל"><select value={form.color || 'sage'} onChange={e => updateForm('color', e.target.value)}><option value="peach">אפרסק</option><option value="sage">מרווה</option><option value="lavender">לבנדר</option><option value="butter">חמאה</option></select></Field></div><div className="person-rules"><label className="rule-check"><input type="checkbox" checked={form.hasLicense === 'true'} disabled={Number(form.age) < 18} onChange={e => updateForm('hasLicense', String(e.target.checked))}/> רישיון נהיגה</label><label className="rule-check"><input type="checkbox" checked={form.hasCar === 'true'} disabled={Number(form.age) < 18} onChange={e => updateForm('hasCar', String(e.target.checked))}/> גישה לרכב</label><label className="rule-check"><input type="checkbox" checked={form.availableForPickup === 'true'} disabled={Number(form.age) < 18} onChange={e => updateForm('availableForPickup', String(e.target.checked))}/> זמין/ה לאיסוף</label></div><div className="form-grid availability-form"><Field label="זמינות נוכחית"><select value={form.availability || 'available'} onChange={e => updateForm('availability', e.target.value)}><option value="available">זמין/ה</option><option value="work">בעבודה</option><option value="travel">בנסיעה</option><option value="unavailable">לא זמין/ה</option></select></Field><Field label="עד מתי? (רשות)"><input type="datetime-local" value={form.unavailableUntil || ''} disabled={form.availability === 'available'} onChange={e => updateForm('unavailableUntil', e.target.value)}/></Field></div><ModalActions onSave={saveForm} onDelete={dialog.item ? () => removePerson(dialog.item!) : undefined} disabled={!form.name?.trim() || form.age === '' || Number(form.age) < 0 || Number(form.age) > 120}/></> : dialog?.type === 'family' ? <><ModalHeading title={dialog.item ? 'עריכת תא משפחתי' : 'תא משפחתי חדש'} description="לכל תא בני משפחה, אירועים ומשימות משלו."/><Field label="שם התא המשפחתי"><input value={form.name || ''} onChange={e => updateForm('name', e.target.value)} placeholder="למשל, המשפחה של סבתא"/></Field><ModalActions onSave={saveForm} disabled={!form.name?.trim()}/></> : dialog?.type === 'resolve' ? <><ModalHeading title="נסדר את האיסוף" description={`${dialog.item.title} · ${dateLabel(dialog.item.date)} בשעה ${dialog.item.time}`}/><div className="plan-explain"><Sparkles size={18}/> בחרו מי ייקח אחריות. אחרי האישור האירוע יתעדכן אצל אותו אדם.</div><Field label="מי אחראי/ת?"><select value={form.responsibleId || ''} onChange={e => updateForm('responsibleId', e.target.value)}><option value="">בחרו בן משפחה</option>{family.people.map(p => <option key={p.id} value={p.id} disabled={!!dialog.item.requiresDriver && !!pickupIneligibility(p, dialog.item, data)}>{p.name}{dialog.item.requiresDriver && !!pickupIneligibility(p, dialog.item, data) ? ` · ${pickupIneligibility(p, dialog.item, data)}` : ''}</option>)}</select></Field><p className="eligibility-note">להסעה נדרשים גיל 18 ומעלה, רישיון, רכב וזמינות לאיסוף.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>לא עכשיו</button><button className="dark-button" disabled={!form.responsibleId || (!!dialog.item.requiresDriver && !family.people.some(p => p.id === form.responsibleId && !pickupIneligibility(p, dialog.item, data)))} onClick={() => resolve(dialog.item)}>אישור התוכנית <ArrowLeft size={16}/></button></div></> : dialog?.type === 'plan' ? <PlanReview dialog={dialog} data={data} family={family} actorId={activePersonId} impact={lateImpact} onClose={() => setDialog(null)} onConfirm={() => confirmPlan(dialog)}/> : <><ModalHeading title="בואו ננסה עדכון משפחתי" description="בהדגמה אפשר לתכנן יום הולדת או לדווח על איחור בעבודה."/><button className="dark-button" onClick={() => { setDialog(null); example('ליובל יש יום הולדת לדניאל מחר בשעה 17:00 וצריך להביא עוגה') }}>ננסה יום הולדת <ArrowLeft size={16}/></button></>}</div></div>}
    {toast && <div className="toast"><CheckCircle2 size={18}/>{toast}<button onClick={() => setToast('')} aria-label="סגירת הודעה"><X size={14}/></button></div>}
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="form-field"><span>{label}</span>{children}</label> }
function ModalHeading({ title, description }: { title: string; description: string }) { return <div className="modal-heading"><span className="modal-symbol"><Sparkles size={22}/></span><h2>{title}</h2><p>{description}</p></div> }
function ModalActions({ onSave, onDelete, disabled }: { onSave: () => void; onDelete?: () => void; disabled?: boolean }) { return <div className="modal-actions">{onDelete && <button className="delete-button" onClick={onDelete}><Trash2 size={15}/> מחיקה</button>}<button className="dark-button" disabled={disabled} onClick={onSave}>שמירה <Check size={16}/></button></div> }
function Empty({ text }: { text: string }) { return <div className="empty-state">{text}</div> }
function PersonalFocus({ person, events, tasks, requests, unresolved, onTask }: { person?: Person; events: FamilyEvent[]; tasks: FamilyTask[]; requests: TransportationRequest[]; unresolved: number; onTask: () => void }) {
  const child = !!person && person.age < 18
  const today = events.filter(event => event.date === localDate())
  const openTasks = tasks.filter(task => !task.done)
  return <div className="personal-focus"><div><span className="section-kicker">{child ? 'היום שלך' : 'צריך אותך'}</span><strong>{child ? `${today.length} דברים בתוכנית שלך` : requests.length ? `${requests.length} בקשות להסעה ממתינות לתשובתך` : unresolved ? `${unresolved} הסעות ללא פתרון` : openTasks.length ? `${openTasks.length} משימות מחכות לך` : 'אין בקשות שממתינות לך'}</strong><small>{child ? 'אירועים ומשימות שקשורים אליך מופיעים בהמשך.' : requests.length ? 'אפשר להשיב בהמשך הדף; התשובה תופיע לכל המשפחה.' : 'השינויים בתוכנית המשפחתית מתעדכנים כאן.'}</small></div><div><span className="section-kicker">{child ? 'המשימות שלי' : 'ההשפעה שלי'}</span><strong>{openTasks.length} משימות פתוחות · {today.length} אירועים היום</strong><button className="text-link" onClick={onTask}>למשימות שלי <ArrowLeft size={15}/></button></div></div>
}
function RequestBoard({ requests, data, actorId, onRespond, onConfirm }: { requests: TransportationRequest[]; data: AppData; actorId: string; onRespond: (id: string, response: 'CAN_DO' | 'CANNOT_DO') => void; onConfirm: (id: string, driverId: string) => void }) {
  const [explanation, setExplanation] = useState<string | null>(null)
  const names = new Map(data.families.flatMap(f => f.people.map(p => [p.id, p.name] as const)))
  if (!requests.length) return null
  return <section className="section-card request-board"><div className="section-heading"><div><span className="section-kicker">תיאום משותף</span><h2>בקשות הסעה במשפחה</h2></div><span className="count-badge">{requests.filter(r => r.status !== 'COVERED').length}</span></div><div className="request-grid">{requests.map(request => {
    const event = data.events.find(item => item.id === request.eventId)
    if (!event) return null
    const recommendation = recommendDriver(data, request)
    const pending = request.status !== 'COVERED' && request.responses[actorId] === 'PENDING' && request.eligibleMemberIds.includes(actorId)
    const answer = request.responses[actorId]
    const status = request.status === 'COVERED' ? 'יש נהג/ת' : request.status === 'UNRESOLVED' ? 'עדיין אין פתרון' : recommendation ? 'ממתין לאישור נהג/ת' : 'ממתינים לתשובות'
    return <article className="request-card" key={request.id}><div className="request-top"><span className="request-icon">🚗</span><span className={`request-status ${request.status.toLowerCase()}`}>{status}</span></div><h3>{event.title}</h3><p>{dateLabel(event.date)} · {event.time} · עבור {names.get(request.passengerId) || 'בן משפחה'}</p><div className="response-list">{request.eligibleMemberIds.map(id => <span key={id}>{names.get(id)}: {request.responses[id] === 'CAN_DO' ? 'יכול/ה' : request.responses[id] === 'CANNOT_DO' ? 'לא יכול/ה' : 'טרם השיב/ה'}</span>)}</div>{pending && <div className="request-actions"><strong>אפשר לסמוך עליך להסעה?</strong><button className="dark-button" onClick={() => onRespond(request.id, 'CAN_DO')}>יכול/ה <Check size={15}/></button><button className="secondary-button" onClick={() => onRespond(request.id, 'CANNOT_DO')}>לא יכול/ה</button></div>}{answer && answer !== 'PENDING' && <small className="my-answer">התשובה שלך: {answer === 'CAN_DO' ? 'יכול/ה' : 'לא יכול/ה'} {(request.status !== 'COVERED' || request.selectedDriverId === actorId) && <button onClick={() => onRespond(request.id, answer === 'CAN_DO' ? 'CANNOT_DO' : 'CAN_DO')}>{request.status === 'COVERED' ? 'אני כבר לא יכול/ה' : 'שינוי תשובה'}</button>}</small>}{recommendation && request.status !== 'COVERED' && <div className="recommendation"><strong>ההמלצה: {recommendation.person.name}</strong><button onClick={() => setExplanation(explanation === request.id ? null : request.id)}>למה?</button>{explanation === request.id && <p>{recommendation.reason}</p>}<button className="dark-button" onClick={() => onConfirm(request.id, recommendation.person.id)}>אישור השיבוץ <ArrowLeft size={15}/></button></div>}{request.status === 'COVERED' && <p className="covered-note">{names.get(request.selectedDriverId)} אחראי/ת להסעה. האירוע מופיע בתוכנית האישית שלו/ה.</p>}{request.status === 'UNRESOLVED' && <p className="unresolved-note">כל הנהגים הכשירים סירבו או שאינם זמינים. אפשר לשנות זמינות או להוסיף נהג/ת כשיר/ה ולבקש שוב; כדאי לתאם הסעה חלופית מחוץ לאפליקציה.</p>}</article>
  })}</div></section>
}
function ScopeSwitch({ value, onChange }: { value: 'mine' | 'family'; onChange: (value: 'mine' | 'family') => void }) { return <div className="scope-switch"><button className={value === 'mine' ? 'selected' : ''} onClick={() => onChange('mine')}>שלי</button><button className={value === 'family' ? 'selected' : ''} onClick={() => onChange('family')}>כל המשפחה</button></div> }
function EventRow({ event, people, onEdit }: { event: FamilyEvent; people: string; onEdit: () => void }) { return <button className="event-row" onClick={onEdit}><span className="event-time">{event.time}</span><span className="event-line"/><span className="event-icon">{event.icon}</span><span className="event-info"><strong>{event.title}</strong><small>{people}{event.details ? ` · ${event.details}` : ''}</small></span><Pencil size={14}/></button> }
function TaskRow({ task, owner, onToggle, onEdit }: { task: FamilyTask; owner?: string; onToggle: () => void; onEdit: () => void }) { return <div className={`task-row ${task.done ? 'is-done' : ''}`}><button className="task-check" onClick={onToggle} aria-label={task.done ? 'סימון כלא בוצע' : 'סימון כבוצע'}>{task.done && <Check size={15}/>}</button><div><strong>{task.title}</strong><small>{dateLabel(task.due)}{owner ? ` · ${owner}` : ''}</small></div><button className="row-edit" onClick={onEdit} aria-label={`עריכת ${task.title}`}><Pencil size={15}/></button></div> }

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












