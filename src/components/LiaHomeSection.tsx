import { CheckCircle2, ChevronDown, Sparkles, Users } from 'lucide-react'
import type { AppData, FamilyUnit } from '../data'
import { requestForEvent } from '../coordination'
import { pickupIneligibility } from '../domain'
import { formatDate } from '../dateTime'
import { buildLiaInterventions, type LiaActionKind, type LiaIntervention } from '../liaInterventions'
import { LiaCard } from './LiaCard'

type Props = {
  data: AppData
  family: FamilyUnit
  actorId: string
  onRideResponse?: (requestId: string, response: 'CAN_DO' | 'CANNOT_DO') => void
  onForwardRide?: (requestId: string, memberIds: string[]) => void
  onAcknowledge?: (eventId: string, status: 'approved' | 'declined') => void
  onReviewPending?: (actionId: string, approved: boolean) => void
}

export function LiaHomeSection({ data, family, actorId, onRideResponse, onForwardRide, onAcknowledge, onReviewPending }: Props) {
  const viewer = family.people.find(person => person.id === actorId)
  const items = buildLiaInterventions(data, family.id).filter(item => !item.signalId || (viewer?.age || 0) >= 18)
  const active = items.filter(item => !['completed', 'noAction'].includes(item.status)).slice(0, 4)
  const handled = items.filter(item => ['completed', 'noAction'].includes(item.status) && (!item.relatedEventId || !data.events.some(event => event.id === item.relatedEventId))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 2)
  const act = (id: string, action: LiaActionKind, targetMemberId?: string) => window.dispatchEvent(new CustomEvent('fampilot:lia-action', { detail: { interventionId: id, action, targetMemberId } }))
  const forActor = (item: LiaIntervention): LiaIntervention => {
    if (item.type !== 'traffic' || !item.relatedEventId) return item
    const event = data.events.find(entry => entry.id === item.relatedEventId)
    const request = requestForEvent(data, item.relatedEventId)
    if (item.status === 'decisionRequired' && event && (viewer?.age || 0) >= 18) return { ...item, actions: [{ id: 'approve', kind: 'approve', label: 'אישור', primary: true }, { id: 'dismiss', kind: 'dismiss', label: 'לא מתאים' }] }
    if (item.status === 'inProgress' && event?.responsibleId === actorId) return { ...item, actions: [{ id: 'complete', kind: 'complete', label: 'אישור וסיום', primary: true }] }
    if (item.status === 'waiting' && request?.responses[actorId] === 'PENDING' && request.eligibleMemberIds.includes(actorId)) return { ...item, statusDetail: 'מי יכול לקחת אחריות?', actions: [{ id: 'accept', kind: 'acceptHandoff', label: 'אישור', primary: true }, { id: 'decline', kind: 'declineHandoff', label: 'לא מתאים' }] }
    return { ...item, actions: [] }
  }
  const reassignCandidates = (item: LiaIntervention) => {
    if ((viewer?.age || 0) < 18 || ['completed', 'noAction'].includes(item.status)) return []
    const event = item.relatedEventId ? data.events.find(entry => entry.id === item.relatedEventId) : undefined
    if (event?.requiresDriver) return family.people.filter(person => person.id !== event.responsibleId && person.id !== actorId && !pickupIneligibility(person, event, data))
    const signal = item.signalId ? (data.externalSignals || []).find(entry => entry.id === item.signalId) : undefined
    if (signal?.taskCandidate) return family.people.filter(person => person.id !== signal.ownerMemberId && person.id !== actorId && person.age >= 18 && !['unavailable', 'travel'].includes(person.availability || 'available'))
    const task = item.relatedTaskId ? data.tasks.find(entry => entry.id === item.relatedTaskId) : undefined
    if (task) return family.people.filter(person => person.id !== task.ownerId && person.id !== actorId && (!task.requiresAdult || person.age >= 18) && !['unavailable', 'travel'].includes(person.availability || 'available'))
    return []
  }
  const visibleActive = active.map(forActor)
  const pendingRides = data.transportationRequests.filter(request => request.familyId === family.id && request.status !== 'CANCELLED' && request.eligibleMemberIds.includes(actorId) && request.responses[actorId] === 'PENDING')
  const pendingApprovals = (data.acknowledgements || []).filter(entry => entry.personId === actorId && !['approved', 'declined'].includes(entry.status) && data.events.some(event => event.id === entry.eventId && event.familyId === family.id))
  const pendingReviews = (viewer?.age || 0) >= 18 ? (data.pendingActions || []).filter(action => action.familyId === family.id) : []
  const hasUrgentEvent = visibleActive.some(item => {
    const event = item.relatedEventId ? data.events.find(entry => entry.id === item.relatedEventId) : undefined
    return event?.priority === 'critical' || /חריג|דחוף|אין כרגע/i.test(`${item.title} ${item.statusDetail || ''}`)
  })
  const needsMyAction = visibleActive.some(item => item.actions.length > 0 && ['decisionRequired', 'waiting'].includes(item.status)) || pendingRides.length > 0 || pendingApprovals.length > 0 || pendingReviews.length > 0
  const hasAnythingOpen = active.length > 0 || pendingRides.length > 0 || pendingApprovals.length > 0 || pendingReviews.length > 0
  const tone = hasUrgentEvent ? 'urgent' : needsMyAction ? 'attention' : 'covered'
  return <div className="lia-home" aria-label="LIA במסך הבית">
    <section className={`lia-priority lia-tone-${tone} ${hasAnythingOpen ? '' : 'lia-all-good'}`}>
      <i className="lia-live-dot" aria-hidden="true"/>
      <div className="lia-section-heading"><span className="lia-section-icon">{hasAnythingOpen ? <Sparkles size={22}/> : <CheckCircle2 size={22}/>}</span><div><span>LIA · Life Intelligence Assistant</span><h2>{needsMyAction ? 'LIA צריכה החלטה ממך' : hasAnythingOpen ? 'LIA זיהתה עבורך' : 'הכול שקט כרגע'}</h2><p>{needsMyAction ? 'יש בקשה שממתינה לתשובה שלך.' : hasAnythingOpen ? 'הדבר המשמעותי שכדאי לדעת עכשיו.' : 'אין עדכונים או החלטות שמחכים לך.'}</p></div></div>
      {(pendingRides.length > 0 || pendingApprovals.length > 0 || pendingReviews.length > 0) && <div className="lia-pending-list">
        {pendingRides.map(request => { const event = data.events.find(entry => entry.id === request.eventId); const candidates = event ? family.people.filter(person => person.id !== actorId && request.eligibleMemberIds.includes(person.id) && !pickupIneligibility(person, event, data)) : []; return <article className="lia-pending-item" key={request.id}><div><span>בקשת הסעה</span><strong>{event?.title || 'אירוע משפחתי'}</strong><small>{event ? `${formatDate(event.date)} · ${event.time}` : 'ממתינה לתשובה'}</small></div><div className="lia-actions"><button className="dark-button" onClick={() => onRideResponse?.(request.id, 'CAN_DO')}>יכול/ה</button><button className="secondary-button" onClick={() => onRideResponse?.(request.id, 'CANNOT_DO')}>לא יכול/ה</button>{candidates.length > 0 && <details className="lia-transfer"><summary className="secondary-button lia-transfer-button"><Users size={15}/>לבקש ממישהו אחר<ChevronDown size={14}/></summary><form className="lia-member-picker" onSubmit={event => { event.preventDefault(); const memberIds = new FormData(event.currentTarget).getAll('memberIds').map(String); if (memberIds.length) onForwardRide?.(request.id, memberIds) }}><span>אפשר לבחור יותר מאדם אחד</span>{candidates.map(person => <label key={person.id}><input type="checkbox" name="memberIds" value={person.id}/><i className={`avatar ${person.color}`}>{person.name.charAt(0)}</i><strong>{person.name}</strong></label>)}<button type="submit" className="dark-button">שליחת בקשה</button></form></details>}</div></article> })}
        {pendingApprovals.map(entry => { const event = data.events.find(item => item.id === entry.eventId); return <article className="lia-pending-item" key={`${entry.eventId}:${entry.personId}`}><div><span>אישור אירוע</span><strong>{event?.title || 'אירוע משפחתי'}</strong><small>ממתין לאישור שלך</small></div><div className="lia-actions"><button className="dark-button" onClick={() => onAcknowledge?.(entry.eventId, 'approved')}>אישור</button><button className="secondary-button" onClick={() => onAcknowledge?.(entry.eventId, 'declined')}>לא מתאים</button></div></article> })}
        {pendingReviews.map(action => <article className="lia-pending-item" key={action.id}><div><span>בקשה לאישור</span><strong>{action.message}</strong></div><div className="lia-actions"><button className="dark-button" onClick={() => onReviewPending?.(action.id, true)}>אישור</button><button className="secondary-button" onClick={() => onReviewPending?.(action.id, false)}>לא מתאים</button></div></article>)}
      </div>}
      {visibleActive.length > 0 && <div className="lia-card-grid">{visibleActive.map(item => <LiaCard key={item.id} item={item} memberName={id => family.people.find(person => person.id === id)?.name || 'בן משפחה'} reassignCandidates={reassignCandidates(item)} onAction={action => act(item.id, action)} onReassign={memberId => act(item.id, 'reassign', memberId)}/>)}</div>}
    </section>
    {handled.length > 0 && <section className="lia-handled"><div className="lia-handled-heading"><CheckCircle2 size={18}/><div><h2>LIA כבר טיפלה</h2><p>אירועים שנסגרו ולא דורשים ממך בדיקה.</p></div></div><ul>{handled.map(item => <li key={item.id}><CheckCircle2 size={15}/><span><strong>{item.resolutionSummary || item.title}</strong>{!item.resolutionSummary && item.statusDetail && <small>{item.statusDetail}</small>}<time>{new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date(item.updatedAt))}</time></span></li>)}</ul></section>}
  </div>
}
