import { CheckCircle2, Sparkles } from 'lucide-react'
import type { AppData, FamilyUnit } from '../data'
import { requestForEvent } from '../coordination'
import { trafficHandoffCandidates } from '../liaCoreFlow'
import { buildLiaInterventions, type LiaActionKind, type LiaIntervention } from '../liaInterventions'
import { LiaCard } from './LiaCard'

export function LiaHomeSection({ data, family, actorId }: { data: AppData; family: FamilyUnit; actorId: string }) {
  const viewer = family.people.find(person => person.id === actorId)
  const items = buildLiaInterventions(data, family.id).filter(item => !item.signalId || (viewer?.age || 0) >= 18)
  const active = items.filter(item => !['completed', 'noAction'].includes(item.status)).slice(0, 4)
  const handled = items.filter(item => ['completed', 'noAction'].includes(item.status) && (!item.relatedEventId || !data.events.some(event => event.id === item.relatedEventId))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 2)
  const act = (id: string, action: LiaActionKind) => window.dispatchEvent(new CustomEvent('fampilot:lia-action', { detail: { interventionId: id, action } }))
  const forActor = (item: LiaIntervention): LiaIntervention => {
    if (item.type !== 'traffic' || !item.relatedEventId) return item
    const event = data.events.find(entry => entry.id === item.relatedEventId)
    const request = requestForEvent(data, item.relatedEventId)
    if (item.status === 'decisionRequired' && event?.responsibleId === actorId) return { ...item, actions: [{ id: 'take', kind: 'takeOwnership', label: 'אני מטפל/ת', primary: true }, { id: 'cannot', kind: 'cannotDo', label: 'לא יכול/ה' }] }
    if (item.status === 'inProgress' && event?.responsibleId === actorId) return { ...item, actions: [{ id: 'complete', kind: 'complete', label: 'אישור וסיום', primary: true }] }
    if (item.status === 'waiting' && request?.responses[actorId] === 'PENDING' && request.eligibleMemberIds.includes(actorId)) return { ...item, statusDetail: 'מי יכול לקחת אחריות?', actions: [{ id: 'accept', kind: 'acceptHandoff', label: 'יכול/ה', primary: true }, { id: 'decline', kind: 'declineHandoff', label: 'לא יכול/ה' }] }
    const candidates = trafficHandoffCandidates(data, item.id)
    return candidates.length ? { ...item, statusDetail: `${item.statusDetail || ''} · מומלץ: ${candidates[0].person.name}`.trim(), actions: [] } : { ...item, actions: [] }
  }
  const visibleActive = active.map(forActor)
  const hasUrgentEvent = visibleActive.some(item => {
    const event = item.relatedEventId ? data.events.find(entry => entry.id === item.relatedEventId) : undefined
    return event?.priority === 'critical' || /חריג|דחוף|אין כרגע/i.test(`${item.title} ${item.statusDetail || ''}`)
  })
  const needsMyAction = visibleActive.some(item => item.actions.length > 0 && ['decisionRequired', 'waiting'].includes(item.status))
  const tone = hasUrgentEvent ? 'urgent' : needsMyAction ? 'attention' : 'covered'
  return <div className="lia-home" aria-label="LIA במסך הבית">
    <section className={`lia-priority lia-tone-${tone} ${active.length ? '' : 'lia-all-good'}`}>
      <i className="lia-live-dot" aria-hidden="true"/>
      <div className="lia-section-heading"><span className="lia-section-icon">{active.length ? <Sparkles size={22}/> : <CheckCircle2 size={22}/>}</span><div><span>LIA · Life Intelligence Assistant</span><h2>{active.some(item => item.status === 'decisionRequired') ? 'LIA צריכה החלטה ממך' : active.length ? 'LIA זיהתה עבורך' : 'הכול שקט כרגע'}</h2><p>{active.length ? 'הדבר המשמעותי שכדאי לדעת עכשיו.' : 'אין עדכונים או החלטות שמחכים לך.'}</p></div></div>
      {visibleActive.length > 0 && <div className="lia-card-grid">{visibleActive.map(item => <LiaCard key={item.id} item={item} memberName={id => family.people.find(person => person.id === id)?.name || 'בן משפחה'} onAction={action => act(item.id, action)}/>)}</div>}
    </section>
    {handled.length > 0 && <section className="lia-handled"><div className="lia-handled-heading"><CheckCircle2 size={18}/><div><h2>LIA כבר טיפלה</h2><p>אירועים שנסגרו ולא דורשים ממך בדיקה.</p></div></div><ul>{handled.map(item => <li key={item.id}><CheckCircle2 size={15}/><span><strong>{item.resolutionSummary || item.title}</strong>{!item.resolutionSummary && item.statusDetail && <small>{item.statusDetail}</small>}<time>{new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.updatedAt))}</time></span></li>)}</ul></section>}
  </div>
}
