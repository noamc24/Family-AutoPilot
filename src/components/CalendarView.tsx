import { useMemo, useState } from 'react'
import { CalendarDays, Car, ChevronLeft, ChevronRight, List, Plus, Rows3 } from 'lucide-react'
import { dateLabel, type FamilyEvent, type FamilyTask, type FamilyUnit } from '../data'
import { calendarDays, defaultCalendarView, eventsForMembers, localIsoDate, startOfWeek, visibleMemberIds, type CalendarDisplay, type CalendarGrouping, type CalendarRange } from '../uiModel'

type Props = {
  family: FamilyUnit
  events: FamilyEvent[]
  tasks: FamilyTask[]
  actorId: string
  childMode: boolean
  onCreate: (date?: string) => void
  onOpenEvent: (event: FamilyEvent) => void
  onOpenTask: (task: FamilyTask) => void
}

const rangeLabels: Record<CalendarRange, string> = { day: 'יומי', week: 'שבועי', month: 'חודשי', year: 'שנתי' }
const weekday = new Intl.DateTimeFormat('he-IL', { weekday: 'short' })
const monthTitle = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })

export function CalendarView({ family, events, tasks, actorId, childMode, onCreate, onOpenEvent, onOpenTask }: Props) {
  const [grouping, setGrouping] = useState<CalendarGrouping>(defaultCalendarView.grouping)
  const [display, setDisplay] = useState<CalendarDisplay>(defaultCalendarView.display)
  const [range, setRange] = useState<CalendarRange>(defaultCalendarView.range)
  const [anchor, setAnchor] = useState(() => new Date())
  const [selectedPeople, setSelectedPeople] = useState<string[]>(() => childMode ? [actorId] : family.people.map(person => person.id))
  const visiblePeople = childMode ? family.people.filter(person => person.id === actorId) : family.people
  const selected = visibleMemberIds(family.people, actorId, childMode, selectedPeople)
  const visibleEvents = useMemo(() => eventsForMembers(events.filter(event => event.familyId === family.id), selected), [events, family.id, selected.join('|')])
  const visibleTasks = useMemo(() => tasks.filter(task => task.familyId === family.id && selected.includes(task.ownerId)), [tasks, family.id, selected.join('|')])

  const go = (delta: number) => setAnchor(previous => {
    const next = new Date(previous)
    if (range === 'day') next.setDate(next.getDate() + delta)
    else if (range === 'week') next.setDate(next.getDate() + delta * 7)
    else if (range === 'month') next.setMonth(next.getMonth() + delta)
    else next.setFullYear(next.getFullYear() + delta)
    return next
  })
  const openDay = (day: Date) => { setAnchor(day); setRange('day') }
  const togglePerson = (id: string) => setSelectedPeople(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])
  const title = range === 'day' ? dateLabel(localIsoDate(anchor)) : range === 'week' ? `${dateLabel(localIsoDate(startOfWeek(anchor)))}–${dateLabel(localIsoDate(calendarDays(anchor, 'week')[6]))}` : range === 'month' ? monthTitle.format(anchor) : String(anchor.getFullYear())

  return <div className="calendar-v2" data-grouping={grouping} data-display={display} data-range={range}>
    <header className="calendar-header"><div><span className="overline">התוכנית המשפחתית</span><h1>יומן</h1><p>{childMode ? 'האירועים, המשימות וההסעות שרלוונטיים אליך.' : 'כל המשפחה, הזמן וההסעות במקום אחד.'}</p></div><button className="primary-action" onClick={() => onCreate(localIsoDate(anchor))}><Plus size={17}/> אירוע</button></header>
    <div className="calendar-toolbar">
      <Segment label="קיבוץ" value={grouping} options={[['days', 'ימים'], ['people', 'אנשים']]} onChange={value => setGrouping(value as CalendarGrouping)}/>
      <Segment label="תצוגה" value={display} options={[['table', 'טבלה'], ['rows', 'שורות']]} onChange={value => setDisplay(value as CalendarDisplay)} icons={[<CalendarDays size={14}/>, <Rows3 size={14}/>]}/>
      <Segment label="טווח" value={range} options={Object.entries(rangeLabels)} onChange={value => setRange(value as CalendarRange)}/>
    </div>
    {grouping === 'people' && <div className="people-filter" aria-label="בחירת בני משפחה">{visiblePeople.map(person => <button key={person.id} className={selected.includes(person.id) ? 'selected' : ''} onClick={() => togglePerson(person.id)} disabled={childMode}><span className={`member-dot ${person.color}`}/>{person.name}</button>)}</div>}
    <div className="calendar-period"><button onClick={() => go(1)} aria-label="הבא"><ChevronRight size={18}/></button><strong>{title}</strong><button onClick={() => go(-1)} aria-label="הקודם"><ChevronLeft size={18}/></button><button className="today-button" onClick={() => setAnchor(new Date())}>היום</button></div>
    {range === 'year' ? <YearView anchor={anchor} events={visibleEvents} onMonth={month => { setAnchor(new Date(anchor.getFullYear(), month, 1)); setRange('month') }}/>
      : display === 'rows' ? <RowsView grouping={grouping} range={range} anchor={anchor} people={visiblePeople.filter(person => selected.includes(person.id))} events={visibleEvents} tasks={visibleTasks} onEvent={onOpenEvent} onTask={onOpenTask}/>
      : grouping === 'people' ? <PeopleTable anchor={anchor} range={range} people={visiblePeople.filter(person => selected.includes(person.id))} events={visibleEvents} onEvent={onOpenEvent}/>
      : range === 'month' ? <MonthTable anchor={anchor} events={visibleEvents} tasks={visibleTasks} family={family} onDay={openDay} onEvent={onOpenEvent}/>
      : <Timeline days={calendarDays(anchor, range)} events={visibleEvents} family={family} onEvent={onOpenEvent}/>} 
  </div>
}

function Segment({ label, value, options, onChange, icons }: { label: string; value: string; options: string[][]; onChange: (value: string) => void; icons?: React.ReactNode[] }) {
  return <div className="calendar-segment"><span>{label}</span><div>{options.map(([id, text], index) => <button key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{icons?.[index]}{text}</button>)}</div></div>
}

function EventAccent({ event, family }: { event: FamilyEvent; family: FamilyUnit }) {
  const ids = [...new Set([...event.participantIds, event.responsibleId].filter(Boolean))]
  return <span className="event-accents">{ids.map(id => <i key={id} className={family.people.find(person => person.id === id)?.color || 'sage'}/>)}</span>
}

function MonthTable({ anchor, events, tasks, family, onDay, onEvent }: { anchor: Date; events: FamilyEvent[]; tasks: FamilyTask[]; family: FamilyUnit; onDay: (day: Date) => void; onEvent: (event: FamilyEvent) => void }) {
  return <div className="month-grid"><div className="month-weekdays">{calendarDays(anchor, 'week').map(day => <span key={day.getDay()}>{weekday.format(day)}</span>)}</div><div className="month-days">{calendarDays(anchor, 'month').map(day => { const iso = localIsoDate(day); const dayEvents = events.filter(event => event.date === iso); const dayTasks = tasks.filter(task => task.due === iso && !task.done); const outside = day.getMonth() !== anchor.getMonth(); return <button className={`month-day ${outside ? 'outside' : ''}`} key={iso} onClick={() => onDay(day)}><time>{day.getDate()}</time><div>{dayEvents.slice(0, 3).map(event => <span className="month-event" key={event.id} onClick={click => { click.stopPropagation(); onEvent(event) }}><EventAccent event={event} family={family}/><b>{event.time}</b> {event.title}{event.sourceSignalId && <em title="ליה עדכנה">✦</em>}</span>)}{dayTasks.length > 0 && <span className="month-task">{dayTasks.length} משימות</span>}</div>{(dayEvents.length || dayTasks.length) > 0 && <aside className="day-popover"><strong>{dateLabel(iso)}</strong>{[...dayEvents.map(event => `${event.time} · ${event.title}`), ...dayTasks.map(task => `משימה · ${task.title}`)].map(item => <span key={item}>{item}</span>)}</aside>}</button> })}</div></div>
}

function Timeline({ days, events, family, onEvent }: { days: Date[]; events: FamilyEvent[]; family: FamilyUnit; onEvent: (event: FamilyEvent) => void }) {
  return <div className={`timeline-table columns-${days.length}`}>{days.map(day => { const iso = localIsoDate(day); return <section key={iso}><header><span>{weekday.format(day)}</span><strong>{day.getDate()}</strong></header><div>{events.filter(event => event.date === iso).map(event => <button className="calendar-event" key={event.id} onClick={() => onEvent(event)}><EventAccent event={event} family={family}/><time>{event.time}</time><strong>{event.title}</strong>{event.responsibleId && <small><Car size={12}/> {family.people.find(person => person.id === event.responsibleId)?.name}{event.departureTime && ` · יציאה ${event.departureTime}`}</small>}{event.requiresDriver && !event.responsibleId && <small className="no-driver">אין נהג</small>}</button>)}</div></section>})}</div>
}

function PeopleTable({ anchor, range, people, events, onEvent }: { anchor: Date; range: CalendarRange; people: FamilyUnit['people']; events: FamilyEvent[]; onEvent: (event: FamilyEvent) => void }) {
  const dates = new Set(calendarDays(anchor, range === 'month' ? 'month' : range).map(localIsoDate))
  return <div className="people-lanes">{people.map(person => <section key={person.id}><header><span className={`avatar mini ${person.color}`}>{person.name[0]}</span><strong>{person.name}</strong></header>{events.filter(event => dates.has(event.date) && (event.participantIds.includes(person.id) || event.responsibleId === person.id)).map(event => <button key={event.id} onClick={() => onEvent(event)}><time>{dateLabel(event.date)} · {event.time}</time><strong>{event.title}</strong>{event.responsibleId === person.id && <small><Car size={12}/> נהג/ת</small>}</button>)}</section>)}</div>
}

function RowsView({ grouping, range, anchor, people, events, tasks, onEvent, onTask }: { grouping: CalendarGrouping; range: CalendarRange; anchor: Date; people: FamilyUnit['people']; events: FamilyEvent[]; tasks: FamilyTask[]; onEvent: (event: FamilyEvent) => void; onTask: (task: FamilyTask) => void }) {
  const dates = new Set(calendarDays(anchor, range === 'month' ? 'month' : range).map(localIsoDate))
  const rows = <>{events.filter(event => dates.has(event.date)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map(event => <button className="calendar-row" key={event.id} onClick={() => onEvent(event)}><time>{event.time}</time><span><strong>{event.title}</strong><small>{dateLabel(event.date)}</small></span>{event.responsibleId && <em><Car size={13}/> {people.find(person => person.id === event.responsibleId)?.name || 'נהג/ת'}</em>}{event.sourceSignalId && <b title="ליה עדכנה">✦</b>}</button>)}{tasks.filter(task => dates.has(task.due)).map(task => <button className="calendar-row task" key={task.id} onClick={() => onTask(task)}><time>משימה</time><span><strong>{task.title}</strong><small>{dateLabel(task.due)}</small></span>{task.sourceSignalId && <b title="ליה יצרה">✦</b>}</button>)}</>
  if (grouping === 'days') return <div className="calendar-rows"><List size={16}/>{rows}</div>
  return <div className="grouped-rows">{people.map(person => <section key={person.id}><h2><span className={`member-dot ${person.color}`}/>{person.name}</h2>{events.filter(event => dates.has(event.date) && (event.participantIds.includes(person.id) || event.responsibleId === person.id)).map(event => <button className="calendar-row" key={`${person.id}:${event.id}`} onClick={() => onEvent(event)}><time>{event.time}</time><span><strong>{event.title}</strong><small>{dateLabel(event.date)}</small></span>{event.responsibleId === person.id && <em><Car size={13}/> מסיע/ה</em>}</button>)}</section>)}</div>
}

function YearView({ anchor, events, onMonth }: { anchor: Date; events: FamilyEvent[]; onMonth: (month: number) => void }) {
  return <div className="year-grid">{Array.from({ length: 12 }, (_, month) => { const date = new Date(anchor.getFullYear(), month, 1); const count = events.filter(event => Number(event.date.slice(0, 4)) === anchor.getFullYear() && Number(event.date.slice(5, 7)) === month + 1).length; return <button key={month} onClick={() => onMonth(month)}><strong>{new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(date)}</strong><span>{count ? `${count} אירועים` : 'חודש פנוי'}</span></button> })}</div>
}
