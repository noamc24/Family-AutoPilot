import { useState } from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import type { AppData, FamilyUnit } from '../data'
import { buildLiaInterventions, transitionLiaIntervention, type LiaActionKind } from '../liaInterventions'
import { LiaCard } from './LiaCard'

export function LiaHomeSection({ data, family, actorId }: { data: AppData; family: FamilyUnit; actorId: string }) {
  const actor = family.people.find(person => person.id === actorId)
  const [items, setItems] = useState(() => buildLiaInterventions(data, family.id))
  const active = items.filter(item => !['completed', 'noAction'].includes(item.status)).slice(0, 4)
  const handled = items.filter(item => ['completed', 'noAction'].includes(item.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4)
  const act = (id: string, action: LiaActionKind) => setItems(previous => previous.map(item => item.id === id ? transitionLiaIntervention(item, action, actor?.name) : item))
  return <div className="lia-home" aria-label="LIA במסך הבית">
    <section className={`lia-priority ${active.length ? '' : 'lia-all-good'}`}>
      <div className="lia-section-heading"><span className="lia-section-icon">{active.length ? <Sparkles size={22}/> : <CheckCircle2 size={22}/>}</span><div><span>LIA · Life Intelligence Assistant</span><h2>{active.some(item => item.status === 'decisionRequired') ? 'דורש תשומת לב' : active.length ? 'LIA זיהתה עבורך' : 'הכל בשליטה'}</h2><p>{active.length ? 'הדברים המשמעותיים ביותר שכדאי לדעת עכשיו.' : 'LIA לא זיהתה כרגע משהו שדורש ממך פעולה.'}</p></div></div>
      {active.length > 0 && <div className="lia-card-grid">{active.map(item => <LiaCard key={item.id} item={item} onAction={action => act(item.id, action)}/>)}</div>}
    </section>
    {handled.length > 0 && <section className="lia-handled"><div className="lia-handled-heading"><CheckCircle2 size={18}/><div><h2>LIA כבר טיפלה</h2><p>דברים שנסגרו ולא דורשים ממך בדיקה.</p></div></div><ul>{handled.map(item => <li key={item.id}><CheckCircle2 size={15}/><span><strong>{item.title}</strong>{item.statusDetail && <small>{item.statusDetail}</small>}</span></li>)}</ul></section>}
  </div>
}
