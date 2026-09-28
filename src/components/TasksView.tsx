import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { dateLabel, localDate, type FamilyTask, type FamilyUnit } from '../data'

type Filter = 'today' | 'week' | 'all'
type Props = { family: FamilyUnit; tasks: FamilyTask[]; actorId: string; childMode: boolean; onCreate: () => void; onEdit: (task: FamilyTask) => void; onDelete: (task: FamilyTask) => void; onToggle: (task: FamilyTask) => void }

export function filterTasksForView(tasks: FamilyTask[], familyId: string, actorId: string, childMode: boolean, filter: Filter, today = localDate()) {
  const weekDate = new Date(`${today}T12:00:00`); weekDate.setDate(weekDate.getDate() + 7)
  const week = `${weekDate.getFullYear()}-${String(weekDate.getMonth() + 1).padStart(2, '0')}-${String(weekDate.getDate()).padStart(2, '0')}`
  return tasks.filter(task => task.familyId === familyId && (!childMode || task.ownerId === actorId)).filter(task => {
    if (filter === 'all') return true
    if (filter === 'today') return task.due === today
    return task.due >= today && task.due <= week
  })
}

export function TasksView({ family, tasks, actorId, childMode, onCreate, onEdit, onDelete, onToggle }: Props) {
  const [filter, setFilter] = useState<Filter>('today')
  const [selected, setSelected] = useState<FamilyTask | null>(null)
  const today = localDate()
  const visible = filterTasksForView(tasks, family.id, actorId, childMode, filter, today)
  const open = visible.filter(task => !task.done).sort((a, b) => a.due.localeCompare(b.due))
  const completed = visible.filter(task => task.done)
  const name = (id: string) => family.people.find(person => person.id === id)?.name || 'ללא שיוך'
  const details = selected && tasks.find(task => task.id === selected.id)
  return <div className="tasks-v2"><header className="tasks-header"><div><h1>משימות</h1><p>{childMode ? 'המשימות ששייכות לך.' : 'מה צריך לקרות, מי אחראי ומתי.'}</p></div>{!childMode && <button className="primary-action" onClick={onCreate}><Plus size={17}/> משימה</button>}</header><div className="task-filters">{([['today', 'היום'], ['week', 'השבוע'], ['all', 'הכל']] as [Filter,string][]).map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><section className="task-rows">{open.map(task => <div className="task-v2-row" key={task.id}><button className="task-check" onClick={() => onToggle(task)} aria-label="סימון כבוצע"/><button className="task-copy" onClick={() => setSelected(task)}><span><strong>{task.title}</strong><small><i className={`member-dot ${family.people.find(person => person.id === task.ownerId)?.color || 'sage'}`}/>{name(task.ownerId)} · {task.due === today ? 'עד היום' : `עד ${dateLabel(task.due)}`}{task.priority === 'critical' ? ' · דחוף' : ''}</small></span>{task.sourceSignalId && <b title="LIA יצרה">✦</b>}</button></div>)}{!open.length && <p className="quiet-copy">{filter === 'today' ? 'אין לך משימות להיום.' : 'אין משימות פתוחות בטווח הזה.'}</p>}</section>{completed.length > 0 && <details className="completed-tasks"><summary>הושלמו · {completed.length}</summary>{completed.map(task => <div className="task-v2-row done" key={task.id}><button className="task-check" onClick={() => onToggle(task)}><Check size={13}/></button><button className="task-copy" onClick={() => setSelected(task)}><span><strong>{task.title}</strong><small>{name(task.ownerId)}</small></span></button></div>)}</details>}{details && <div className="detail-backdrop" onMouseDown={event => event.target === event.currentTarget && setSelected(null)}><aside className="detail-sheet task-detail" role="dialog" aria-modal="true" aria-label="פרטי משימה"><button className="detail-close" onClick={() => setSelected(null)} aria-label="סגירה"><X size={18}/></button><span className="detail-kicker">פרטי משימה</span><h2>{details.title}</h2><dl><div><dt>אחראי/ת</dt><dd>{name(details.ownerId)}</dd></div><div><dt>מועד</dt><dd>{details.due === today ? 'היום' : dateLabel(details.due)}</dd></div><div><dt>סטטוס</dt><dd>{details.done ? 'הושלמה' : 'פתוחה'}</dd></div>{details.sourceSignalId && <div><dt>מקור</dt><dd><b className="lia-mark">✦</b> LIA יצרה את המשימה בעקבות עדכון חיצוני</dd></div>}</dl><div className="detail-actions"><button className="secondary-button" onClick={() => { onEdit(details); setSelected(null) }}><Pencil size={15}/> עריכה</button><button className="dark-button" onClick={() => onToggle(details)}><Check size={15}/> {details.done ? 'החזרה לפתוחות' : 'סימון כהושלם'}</button>{!childMode && <button className="quiet-danger" onClick={() => { onDelete(details); setSelected(null) }}><Trash2 size={15}/> מחיקה</button>}</div></aside></div>}</div>
}
