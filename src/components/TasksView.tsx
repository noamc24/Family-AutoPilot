import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { dateLabel, localDate, type FamilyTask, type FamilyUnit } from '../data'

type Filter = 'today' | 'week' | 'all'
type Props = { family: FamilyUnit; tasks: FamilyTask[]; actorId: string; childMode: boolean; onCreate: () => void; onOpen: (task: FamilyTask) => void; onToggle: (task: FamilyTask) => void }

export function TasksView({ family, tasks, actorId, childMode, onCreate, onOpen, onToggle }: Props) {
  const [filter, setFilter] = useState<Filter>('today')
  const today = localDate()
  const week = localDate(7)
  const visible = tasks.filter(task => task.familyId === family.id && (!childMode || task.ownerId === actorId)).filter(task => filter === 'all' || task.due <= (filter === 'today' ? today : week))
  const open = visible.filter(task => !task.done).sort((a, b) => a.due.localeCompare(b.due))
  const completed = visible.filter(task => task.done)
  const name = (id: string) => family.people.find(person => person.id === id)?.name || 'ללא שיוך'
  return <div className="tasks-v2"><header className="tasks-header"><div><span className="overline">אחריות משותפת</span><h1>משימות</h1><p>{childMode ? 'המשימות ששייכות לך.' : 'מה צריך לקרות, מי אחראי ומתי.'}</p></div>{!childMode && <button className="primary-action" onClick={onCreate}><Plus size={17}/> משימה</button>}</header><div className="task-filters">{([['today', 'היום'], ['week', 'השבוע'], ['all', 'הכל']] as [Filter,string][]).map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><section className="task-rows">{open.map(task => <div className="task-v2-row" key={task.id}><button className="task-check" onClick={() => onToggle(task)} aria-label="סימון כבוצע"/><button className="task-copy" onClick={() => onOpen(task)}><time>{task.due === today ? 'היום' : dateLabel(task.due)}</time><span><strong>{task.title}</strong><small>{name(task.ownerId)} · עד {dateLabel(task.due)}</small></span>{task.sourceSignalId && <b title="ליה יצרה">✦</b>}</button></div>)}{!open.length && <p className="quiet-copy">אין משימות פתוחות בטווח הזה.</p>}</section>{completed.length > 0 && <details className="completed-tasks"><summary>הושלמו · {completed.length}</summary>{completed.map(task => <div className="task-v2-row done" key={task.id}><button className="task-check" onClick={() => onToggle(task)}><Check size={13}/></button><button className="task-copy" onClick={() => onOpen(task)}><span><strong>{task.title}</strong><small>{name(task.ownerId)}</small></span></button></div>)}</details>}</div>
}
