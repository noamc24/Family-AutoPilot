import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Car, ChevronLeft, ChevronRight, List, Pencil, Plus, Repeat2, Rows3, Sparkles, X } from 'lucide-react'
import { dateLabel, localDate, type FamilyEvent, type FamilyTask, type FamilyUnit } from '../data'
import { calendarDatesForRange, calendarRendererFor, deriveRoutineOccurrences, timeMinutes, visibleMonthItems, type RoutineOccurrence } from '../calendarModel'
import { calendarDays, defaultCalendarView, eventsForMembers, localIsoDate, startOfWeek, visibleMemberIds, type CalendarDisplay, type CalendarGrouping, type CalendarRange } from '../uiModel'
import { formatTimeRange } from '../uiFormatting'

type Props = { family: FamilyUnit; events: FamilyEvent[]; tasks: FamilyTask[]; actorId: string; childMode: boolean; navigationTarget?: { eventId: string; date: string; key: number } | null; onCreate: (date?: string) => void; onOpenEvent: (event: FamilyEvent) => void; onDeleteEvent?: (event: FamilyEvent) => void; onOpenTask: (task: FamilyTask) => void }
type Detail = { kind: 'event'; event: FamilyEvent } | { kind: 'routine'; routine: RoutineOccurrence }
type CalendarItem = FamilyEvent | RoutineOccurrence

const rangeLabels: Record<CalendarRange, string> = { day: 'יומי', week: 'שבועי', month: 'חודשי', year: 'שנתי' }
const weekday = new Intl.DateTimeFormat('he-IL', { weekday: 'short' })
const monthTitle = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })
const rowDateLabel = (value: string) => new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`))
const isRoutine = (item: CalendarItem): item is RoutineOccurrence => 'kind' in item && item.kind === 'routine'
const itemTime = (item: CalendarItem) => isRoutine(item) ? item.start : item.time
const itemEnd = (item: CalendarItem) => isRoutine(item) ? item.end : item.endTime || `${String(Math.min(23, Number(item.time.slice(0, 2)) + 1)).padStart(2, '0')}:${item.time.slice(3, 5)}`

export function CalendarView({ family, events, tasks, actorId, childMode, navigationTarget, onCreate, onOpenEvent, onDeleteEvent = onOpenEvent, onOpenTask }: Props) {
  const [grouping, setGrouping] = useState<CalendarGrouping>(defaultCalendarView.grouping)
  const [display, setDisplay] = useState<CalendarDisplay>(defaultCalendarView.display)
  const [range, setRange] = useState<CalendarRange>(defaultCalendarView.range)
  const [anchor, setAnchor] = useState(() => new Date())
  const [selectedPeople, setSelectedPeople] = useState<string[]>(() => childMode ? [actorId] : family.people.map(person => person.id))
  const [detail, setDetail] = useState<Detail | null>(null)
  const personal = grouping === 'personal'
  const visiblePeople = childMode || personal ? family.people.filter(person => person.id === actorId) : family.people
  const selected = personal ? visibleMemberIds(family.people, actorId, true) : visibleMemberIds(family.people, actorId, childMode, selectedPeople)
  const dates = useMemo(() => calendarDatesForRange(anchor, range), [anchor, range])
  const visibleEvents = useMemo(() => eventsForMembers(events.filter(event => event.familyId === family.id), selected), [events, family.id, selected.join('|')])
  const visibleTasks = useMemo(() => tasks.filter(task => task.familyId === family.id && selected.includes(task.ownerId)), [tasks, family.id, selected.join('|')])
  const routines = useMemo(() => deriveRoutineOccurrences(family, dates, visibleEvents, selected), [family, dates.map(localIsoDate).join('|'), visibleEvents, selected.join('|')])
  const renderer = calendarRendererFor(range, grouping, display)
  const isEmpty = !events.some(event => event.familyId === family.id) && !tasks.some(task => task.familyId === family.id) && !family.people.some(person => person.routines?.length)

  useEffect(() => {
    if (!navigationTarget) return
    const event = events.find(item => item.id === navigationTarget.eventId)
    const date = new Date(`${navigationTarget.date}T12:00:00`)
    if (!event || Number.isNaN(date.getTime())) return
    setAnchor(date)
    setRange('day')
    setDetail({ kind: 'event', event })
  }, [navigationTarget?.key])

  const go = (delta: number) => setAnchor(previous => { const next = new Date(previous); if (range === 'day') next.setDate(next.getDate() + delta); else if (range === 'week') next.setDate(next.getDate() + delta * 7); else if (range === 'month') next.setMonth(next.getMonth() + delta); else next.setFullYear(next.getFullYear() + delta); return next })
  const openDay = (day: Date) => { setAnchor(day); setRange('day') }
  const togglePerson = (id: string) => setSelectedPeople(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])
  const showItem = (item: CalendarItem) => setDetail(isRoutine(item) ? { kind: 'routine', routine: item } : { kind: 'event', event: item })
  const title = range === 'day' ? dateLabel(localIsoDate(anchor)) : range === 'week' ? `${dateLabel(localIsoDate(startOfWeek(anchor)))}–${dateLabel(localIsoDate(calendarDays(anchor, 'week')[6]))}` : range === 'month' ? monthTitle.format(anchor) : String(anchor.getFullYear())

  return <div className="calendar-v2" data-grouping={grouping} data-display={display} data-range={range}>
    <header className="calendar-header"><div><span className="overline">{personal ? 'התוכנית האישית שלך' : 'התוכנית המשפחתית'}</span><h1>יומן</h1></div><button className="primary-action" onClick={() => onCreate(localIsoDate(anchor))}><Plus size={17}/> אירוע</button></header>
    <div className="calendar-controls">
      <div className="calendar-commandbar"><div className="calendar-period"><button onClick={() => go(1)} aria-label="הבא"><ChevronRight size={18}/></button><strong>{title}</strong><button onClick={() => go(-1)} aria-label="הקודם"><ChevronLeft size={18}/></button><button className="today-button" onClick={() => setAnchor(new Date())}>היום</button></div><Segment className="range-segment" label="טווח" value={range} options={Object.entries(rangeLabels)} onChange={value => setRange(value as CalendarRange)}/></div>
      <div className="calendar-toolbar"><Segment label="יומן" value={grouping} options={[['personal', 'אישי'], ['family', 'משפחתי']]} onChange={value => setGrouping(value as CalendarGrouping)}/><Segment label="תצוגה" value={display} options={[['table', 'טבלה'], ['rows', 'שורות']]} onChange={value => setDisplay(value as CalendarDisplay)} icons={[<CalendarDays size={14}/>, <Rows3 size={14}/>]}/></div>
    </div>
    {grouping === 'family' && <div className="people-filter" aria-label="בחירת בני משפחה">{visiblePeople.map(person => <button key={person.id} className={`${selected.includes(person.id) ? 'selected' : ''} ${person.color}`} onClick={() => togglePerson(person.id)} disabled={childMode}><span className={`avatar mini ${person.color}`}>{person.name[0]}</span>{person.name}</button>)}</div>}
    {isEmpty
      ? <section className="first-empty-state calendar-empty-state"><span className="first-empty-mark"><CalendarDays size={22}/><i><Sparkles size={10}/></i></span><div><span className="first-empty-kicker">היומן מוכן</span><h2>עדיין אין אירועים</h2><p>הוסיפו את האירוע הראשון והלו״ז המשפחתי יתחיל להיבנות כאן.</p></div><button className="primary-action" onClick={() => onCreate(localIsoDate(anchor))}><Plus size={16}/> הוספת אירוע ראשון</button></section>
      : <CalendarBody renderer={renderer} anchor={anchor} days={dates} people={visiblePeople.filter(person => selected.includes(person.id))} events={visibleEvents} routines={routines} tasks={visibleTasks} family={family} personal={personal} onDay={openDay} onItem={showItem} onTask={onOpenTask} onMonth={month => { setAnchor(new Date(anchor.getFullYear(), month, 1)); setRange('month') }}/>
    }
    {detail && (
      <CalendarDetail detail={detail} family={family} childMode={childMode} personal={personal} onClose={() => setDetail(null)} onEdit={event => { setDetail(null); onOpenEvent(event) }} onDelete={event => { setDetail(null); onDeleteEvent(event) }}/>
    )}
  </div>
}

function CalendarBody({ renderer, anchor, days, people, events, routines, tasks, family, personal, onDay, onItem, onTask, onMonth }: { renderer: ReturnType<typeof calendarRendererFor>; anchor: Date; days: Date[]; people: FamilyUnit['people']; events: FamilyEvent[]; routines: RoutineOccurrence[]; tasks: FamilyTask[]; family: FamilyUnit; personal: boolean; onDay: (day: Date) => void; onItem: (item: CalendarItem) => void; onTask: (task: FamilyTask) => void; onMonth: (month: number) => void }) {
  switch (renderer) {
    case 'yearly-grid': return <YearView anchor={anchor} events={events} routines={routines} onMonth={onMonth}/>
    case 'monthly-grid': return <MonthTable anchor={anchor} events={events} routines={routines} tasks={tasks} family={family} personal={personal} onDay={onDay} onItem={onItem}/>
    case 'people-table': return <PeopleTable anchor={anchor} days={days} people={people} events={events} routines={routines} onItem={onItem}/>
    case 'people-rows': return <RowsView grouping="family" days={days} people={people} events={events} routines={routines} tasks={tasks} personal={false} onItem={onItem} onTask={onTask}/>
    case 'day-rows': return <RowsView grouping="personal" days={days} people={people} events={events} routines={routines} tasks={tasks} personal={personal} onItem={onItem} onTask={onTask}/>
    case 'daily-timeline': return <TimeGrid days={days.slice(0, 1)} events={events} routines={routines} family={family} personal={personal} onItem={onItem}/>
    case 'weekly-timeline': return <TimeGrid days={days.slice(0, 7)} events={events} routines={routines} family={family} personal={personal} onItem={onItem}/>
  }
}

function Segment({ label, value, options, onChange, icons, className = '' }: { label: string; value: string; options: string[][]; onChange: (value: string) => void; icons?: React.ReactNode[]; className?: string }) {
  return <div className={`calendar-segment ${className}`}><span>{label}</span><div role="group" aria-label={label}>{options.map(([id, text], index) => <button key={id} className={value === id ? 'active' : ''} aria-pressed={value === id} onClick={() => onChange(id)}>{icons?.[index]}{text}</button>)}</div></div>
}

function EventAccent({ event, family }: { event: FamilyEvent; family: FamilyUnit }) {
  const ids = [...new Set([...event.participantIds, event.responsibleId].filter(Boolean))]
  return <span className="event-accents">{ids.map(id => <i key={id} className={family.people.find(person => person.id === id)?.color || 'sage'}/>)}</span>
}

function MonthItem({ item, family, personal, onItem }: { item: CalendarItem; family: FamilyUnit; personal: boolean; onItem: (item: CalendarItem) => void }) {
  if (isRoutine(item)) return <span className={`month-event routine ${item.color}`} onClick={event => { event.stopPropagation(); onItem(item) }}><Repeat2 size={9}/><b>{item.start}</b><span className="month-event-title">{item.title}</span></span>
  return <span className={`month-event ${item.sourceSignalId ? 'lia-event' : ''} ${item.needsAttention ? 'needs-attention' : ''} ${item.priority === 'critical' ? 'is-critical' : ''}`} title={item.sourceSignalId ? item.sourceNote || 'LIA יצרה או עדכנה את האירוע' : item.title} onClick={event => { event.stopPropagation(); onItem(item) }}>{!personal && <EventAccent event={item} family={family}/>}<b>{item.time}</b><span className="month-event-title">{item.title}</span>{item.sourceSignalId && <em title="LIA עדכנה">✦</em>}</span>
}

function MonthTable({ anchor, events, routines, tasks, family, personal, onDay, onItem }: { anchor: Date; events: FamilyEvent[]; routines: RoutineOccurrence[]; tasks: FamilyTask[]; family: FamilyUnit; personal: boolean; onDay: (day: Date) => void; onItem: (item: CalendarItem) => void }) {
  return <div className="month-grid"><div className="month-weekdays">{calendarDays(anchor, 'week').map(day => <span key={day.getDay()}>{weekday.format(day)}</span>)}</div><div className="month-days">{calendarDays(anchor, 'month').map(day => { const iso = localIsoDate(day); const items = visibleMonthItems(events, routines, iso); const dayTasks = tasks.filter(task => task.due === iso && !task.done); const outside = day.getMonth() !== anchor.getMonth(); const today = iso === localDate(); const selected = iso === localIsoDate(anchor); return <button className={`month-day ${outside ? 'outside' : ''} ${today ? 'today' : ''} ${selected ? 'selected' : ''}`} key={iso} onClick={() => onDay(day)}><time>{day.getDate()}</time><div>{items.visible.map(item => <MonthItem key={item.id} item={item} family={family} personal={personal} onItem={onItem}/>)}{items.overflow > 0 && <span className="month-overflow">+{items.overflow} נוספים</span>}{dayTasks.length > 0 && <span className="month-task">{dayTasks.length} משימות</span>}</div>{(items.all.length || dayTasks.length) > 0 && <aside className="day-popover"><strong>{dateLabel(iso)}</strong>{items.all.map(item => <span className={!isRoutine(item) ? `${item.sourceSignalId ? 'lia-event' : ''} ${item.needsAttention ? 'needs-attention' : ''}` : ''} key={item.id}><time>{itemTime(item)}</time><i className={isRoutine(item) ? item.color : ''}/><b>{isRoutine(item) && !personal ? `${item.title} · ${item.personName}` : item.title}</b>{isRoutine(item) && <Repeat2 size={11}/>} {!personal && !isRoutine(item) && item.responsibleId && <small><Car size={11}/> {family.people.find(person => person.id === item.responsibleId)?.name}</small>}{!isRoutine(item) && item.sourceSignalId && <em title={item.sourceNote || 'LIA עדכנה'}>✦</em>}</span>)}{dayTasks.map(task => <span key={task.id}><b>{task.title}</b><small>משימה</small></span>)}</aside>}</button> })}</div></div>
}

function TimeGrid({ days, events, routines, family, personal, onItem }: { days: Date[]; events: FamilyEvent[]; routines: RoutineOccurrence[]; family: FamilyUnit; personal: boolean; onItem: (item: CalendarItem) => void }) {
  const startHour = 6, endHour = 22, span = (endHour - startHour) * 60
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
  const now = new Date(), today = localIsoDate(now), nowOffset = ((now.getHours() * 60 + now.getMinutes() - startHour * 60) / span) * 88
  return <div className={`time-grid days-${days.length}`}><aside className="time-axis">{hours.map(hour => <span key={hour} style={{ top: `${((hour - startHour) / (endHour - startHour)) * 100}%` }}>{String(hour).padStart(2, '0')}:00</span>)}</aside><div className="time-lanes">{days.map(day => { const iso = localIsoDate(day); const items: CalendarItem[] = [...events.filter(event => event.date === iso), ...routines.filter(item => item.date === iso)].sort((a, b) => itemTime(a).localeCompare(itemTime(b))); return <section key={iso} className={iso === today ? 'today' : ''}><header><span>{weekday.format(day)}</span><strong>{day.getDate()}</strong></header><div className="hour-lines">{hours.slice(0, -1).map(hour => <i key={hour}/>)}</div>{items.map(item => <TimedBlock key={item.id} item={item} startHour={startHour} span={span} family={family} personal={personal} onItem={onItem}/>)}{iso === today && nowOffset >= 0 && nowOffset <= 88 && <span className="current-time-line" style={{ top: `calc(48px + ${nowOffset}%)` }}/>}</section>})}</div></div>
}

function TimedBlock({ item, startHour, span, family, personal = false, onItem }: { item: CalendarItem; startHour: number; span: number; family: FamilyUnit; personal?: boolean; onItem: (item: CalendarItem) => void }) {
  const start = Math.max(0, timeMinutes(itemTime(item)) - startHour * 60), duration = Math.max(34, timeMinutes(itemEnd(item)) - timeMinutes(itemTime(item)))
  const color = isRoutine(item) ? item.color : family.people.find(person => item.participantIds.includes(person.id))?.color || 'sage'
  return <button className={`calendar-block ${isRoutine(item) ? 'routine' : ''} ${color} ${!isRoutine(item) && item.sourceSignalId ? 'lia-event' : ''} ${!isRoutine(item) && item.needsAttention ? 'needs-attention' : ''} ${!isRoutine(item) && item.priority === 'critical' ? 'is-critical' : ''}`} style={{ top: `calc(48px + ${(start / span) * 88}%)`, height: `${Math.max(4.5, (duration / span) * 88)}%` }} onClick={() => onItem(item)}><span>{itemEnd(item) !== itemTime(item) ? formatTimeRange(itemTime(item), itemEnd(item)) : itemTime(item)}</span><strong>{item.title}</strong>{!personal && (isRoutine(item) ? <small><Repeat2 size={11}/> {item.personName}</small> : item.responsibleId ? <small><Car size={11}/> {family.people.find(person => person.id === item.responsibleId)?.name}</small> : null)}{!isRoutine(item) && item.sourceSignalId && <em title={item.sourceNote || 'LIA עדכנה'}>✦</em>}</button>
}

function PeopleTable({ anchor, days, people, events, routines, onItem }: { anchor: Date; days: Date[]; people: FamilyUnit['people']; events: FamilyEvent[]; routines: RoutineOccurrence[]; onItem: (item: CalendarItem) => void }) {
  const focusDate = localIsoDate(days.length === 1 ? days[0] : days.some(day => localIsoDate(day) === localDate()) ? new Date() : anchor)
  const startHour = 6, endHour = 22, span = (endHour - startHour) * 60
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
  return <div className="people-schedule"><div className="people-schedule-caption">השוואת זמינות · {dateLabel(focusDate)}</div><aside className="time-axis">{hours.map(hour => <span key={hour} style={{ top: `${((hour - startHour) / (endHour - startHour)) * 100}%` }}>{String(hour).padStart(2, '0')}:00</span>)}</aside><div className="people-schedule-lanes">{people.map(person => { const items: CalendarItem[] = [...events.filter(event => event.date === focusDate && (event.participantIds.includes(person.id) || event.responsibleId === person.id)), ...routines.filter(item => item.date === focusDate && item.personId === person.id)]; return <section key={person.id}><header><span className={`avatar mini ${person.color}`}>{person.name[0]}</span><strong>{person.name}</strong></header><div className="hour-lines">{hours.slice(0, -1).map(hour => <i key={hour}/>)}</div>{items.map(item => <TimedBlock key={`${person.id}:${item.id}`} item={item} startHour={startHour} span={span} family={{ id: '', name: '', people }} onItem={onItem}/>)}</section>})}</div></div>
}

function RowsView({ grouping, days, people, events, routines, tasks, personal, onItem, onTask }: { grouping: CalendarGrouping; days: Date[]; people: FamilyUnit['people']; events: FamilyEvent[]; routines: RoutineOccurrence[]; tasks: FamilyTask[]; personal: boolean; onItem: (item: CalendarItem) => void; onTask: (task: FamilyTask) => void }) {
  const dates = new Set(days.map(localIsoDate))
  const populatedDays = days.filter(day => { const iso = localIsoDate(day); return events.some(event => event.date === iso) || routines.some(item => item.date === iso) || tasks.some(task => task.due === iso) })
  const subtitle = (item: CalendarItem) => {
    const date = grouping === 'family' ? rowDateLabel(item.date) : dateLabel(item.date)
    return !isRoutine(item) && item.sourceSignalId ? `✦ ${item.sourceNote || 'LIA עדכנה'} · ${date}` : date
  }
  const row = (item: CalendarItem, suffix?: React.ReactNode) => <button className={`calendar-row ${isRoutine(item) ? 'routine' : ''} ${!isRoutine(item) && item.sourceSignalId ? 'lia-event' : ''} ${!isRoutine(item) && item.needsAttention ? 'needs-attention' : ''} ${!isRoutine(item) && item.priority === 'critical' ? 'is-critical' : ''}`} key={item.id} onClick={() => onItem(item)}><time>{itemEnd(item) !== itemTime(item) ? formatTimeRange(itemTime(item), itemEnd(item)) : itemTime(item)}</time><span><strong>{item.title}</strong><small>{subtitle(item)}</small></span>{isRoutine(item) ? <em><Repeat2 size={13}/> קבוע</em> : !personal && suffix}{!isRoutine(item) && item.sourceSignalId && <b title="LIA עדכנה">✦</b>}</button>
  if (grouping === 'family') return <div className="grouped-rows people-rows">{people.map(person => { const items: CalendarItem[] = [...events.filter(event => dates.has(event.date) && (event.participantIds.includes(person.id) || event.responsibleId === person.id)), ...routines.filter(item => dates.has(item.date) && item.personId === person.id)].sort((a, b) => `${a.date}${itemTime(a)}`.localeCompare(`${b.date}${itemTime(b)}`)); return <section key={person.id}><h2><span className={`avatar mini ${person.color}`}>{person.name[0]}</span>{person.name}</h2>{items.length ? items.map(item => row(item, !isRoutine(item) && item.responsibleId === person.id ? <em><Car size={13}/> מסיע/ה</em> : null)) : <p>אין אירועים מתוכננים כאן.</p>}</section>})}</div>
  return <div className="grouped-rows day-rows">{populatedDays.length ? populatedDays.map(day => { const iso = localIsoDate(day); const items: CalendarItem[] = [...events.filter(event => event.date === iso), ...routines.filter(item => item.date === iso)].sort((a, b) => itemTime(a).localeCompare(itemTime(b))); return <section key={iso}><h2>{dateLabel(iso)}</h2>{items.map(item => row(item, !isRoutine(item) && item.responsibleId ? <em><Car size={13}/> {people.find(person => person.id === item.responsibleId)?.name || 'נהג/ת'}</em> : null))}{tasks.filter(task => task.due === iso).map(task => <button className="calendar-row task" key={task.id} onClick={() => onTask(task)}><time>משימה</time><span><strong>{task.title}</strong></span>{task.sourceSignalId && <b>✦</b>}</button>)}</section>}) : <p className="calendar-empty">אין אירועים מתוכננים כאן.</p>}</div>
}

function YearView({ anchor, events, routines, onMonth }: { anchor: Date; events: FamilyEvent[]; routines: RoutineOccurrence[]; onMonth: (month: number) => void }) {
  return <div className="year-grid">{Array.from({ length: 12 }, (_, month) => { const date = new Date(anchor.getFullYear(), month, 1); const days = Array.from({ length: new Date(anchor.getFullYear(), month + 1, 0).getDate() }, (_, index) => index + 1); const eventCount = events.filter(event => Number(event.date.slice(0, 4)) === anchor.getFullYear() && Number(event.date.slice(5, 7)) === month + 1).length; const routineCount = routines.filter(item => Number(item.date.slice(5, 7)) === month + 1).length; return <button key={month} onClick={() => onMonth(month)}><header><strong>{new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(date)}</strong><span>{eventCount} אירועים · {routineCount} קבועים</span></header><div>{days.map(day => { const iso = `${anchor.getFullYear()}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const busy = events.some(event => event.date === iso) || routines.some(item => item.date === iso); return <i className={busy ? 'busy' : ''} key={day}>{day}</i> })}</div></button> })}</div>
}

function CalendarDetail({ detail, family, childMode, personal, onClose, onEdit, onDelete }: { detail: Detail; family: FamilyUnit; childMode: boolean; personal: boolean; onClose: () => void; onEdit: (event: FamilyEvent) => void; onDelete: (event: FamilyEvent) => void }) {
  const routine = detail.kind === 'routine' ? detail.routine : null, event = detail.kind === 'event' ? detail.event : null
  return <div className="calendar-detail-backdrop" onClick={onClose}><aside className="calendar-detail" onClick={click => click.stopPropagation()}><button className="calendar-detail-close" onClick={onClose} aria-label="סגירה"><X size={18}/></button><span className="overline">{routine ? 'לו״ז קבוע' : event?.sourceSignalId ? 'פרטי אירוע · ✦ LIA' : 'פרטי אירוע'}</span><h2>{routine?.title || event?.title}</h2><div className="calendar-detail-lines"><p><strong>מתי</strong>{dateLabel(routine?.date || event!.date)} · {routine?.end || event?.endTime ? formatTimeRange(routine?.start || event?.time || '', routine?.end || event?.endTime || '') : routine?.start || event?.time}</p>{routine && !personal && <p><strong>שייך ל־</strong>{routine.personName}</p>}{event && !personal && <p><strong>משתתפים</strong>{event.participantIds.map(id => family.people.find(person => person.id === id)?.name).filter(Boolean).join(', ') || 'המשפחה'}</p>}{event?.responsibleId && !personal && <p><strong>הסעה</strong><Car size={13}/> {family.people.find(person => person.id === event.responsibleId)?.name}{event.departureTime && ` · יציאה ${event.departureTime}`}</p>}{routine && <p><strong>חזרתיות</strong><Repeat2 size={13}/> חוזר בכל שבוע</p>}{event?.sourceSignalId && <p><strong>LIA</strong><em>✦</em> {event.sourceNote || 'האירוע נוסף או עודכן בעקבות מקור מחובר'}</p>}{event?.details && <p><strong>פרטים</strong>{event.details}</p>}</div>{event && !childMode && <div className="calendar-detail-actions"><button className="secondary-button calendar-edit" onClick={() => onEdit(event)}><Pencil size={14}/> עריכה</button>{event.sourceSignalId && <button className="secondary-button danger" onClick={() => onDelete(event)}>מחיקה</button>}</div>}</aside></div>
}
