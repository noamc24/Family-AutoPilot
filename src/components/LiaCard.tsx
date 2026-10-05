import { Check, ChevronDown, Sparkles, Users } from 'lucide-react'
import type { Person } from '../data'
import { sourceDefinitionById } from '../sourceDefinitions'
import { liaStatusLabels, type LiaActionKind, type LiaIntervention } from '../liaInterventions'
import { SourceIcon } from './SourceIcon'

const actionLabel = (kind: LiaActionKind, fallback: string) => ['addToCalendar', 'createTask', 'takeOwnership', 'complete', 'acceptHandoff', 'approve'].includes(kind) ? 'אישור' : ['dismiss', 'cannotDo', 'declineHandoff'].includes(kind) ? 'לא מתאים' : fallback

export function LiaCard({ item, onAction, onReassign, reassignCandidates = [], memberName }: { item: LiaIntervention; onAction: (action: LiaActionKind) => void; onReassign?: (memberId: string) => void; reassignCandidates?: Person[]; memberName?: (id: string) => string }) {
  return <article className={`lia-card lia-card-${item.status}`} data-state={item.status}>
    <div className="lia-card-head"><span className="lia-mark"><Sparkles size={18}/></span><div><span className="lia-card-kicker">✦ LIA זיהתה · {item.type === 'traffic' ? 'תזמון והגעה' : item.type === 'message' ? 'עדכון' : 'תיאום משפחתי'}</span><h3>{item.title}</h3></div><span className="lia-status"><Check size={13}/>{item.statusDetail || liaStatusLabels[item.status]}</span></div>
    <p className="lia-detected">{item.detectedChange}</p>
    <div className="lia-context"><span>למה זה חשוב</span><p>{item.whyItMatters}</p></div>
    {item.recommendation && <div className="lia-recommendation"><Sparkles size={15}/><div><span>LIA ממליצה</span><strong>{item.recommendation}</strong></div></div>}
    {(item.actions.length > 0 || reassignCandidates.length > 0) && <div className="lia-decision-area"><div className="lia-actions">{item.actions.map(action => <button type="button" key={action.id} className={action.primary ? 'dark-button' : 'secondary-button'} onClick={() => onAction(action.kind)}>{actionLabel(action.kind, action.label)}</button>)}{reassignCandidates.length > 0 && <details className="lia-transfer"><summary className="secondary-button lia-transfer-button"><Users size={15}/>העברה<ChevronDown size={14}/></summary><div className="lia-member-picker" aria-label="בחירת בן משפחה להעברה"><span>העברה אל</span>{reassignCandidates.map(person => <button type="button" key={person.id} onClick={() => onReassign?.(person.id)}><i className={`avatar ${person.color}`}>{person.name.charAt(0)}</i><strong>{person.name}</strong><small>{person.role}</small></button>)}</div></details>}</div></div>}
    <div className="lia-card-foot"><div className="lia-sources"><span>מקורות</span>{item.sources.map(source => { const definition = sourceDefinitionById[source.sourceId]; const owner = source.ownerMemberId && memberName ? memberName(source.ownerMemberId) : ''; return <span className="lia-source" key={source.sourceId}><span className="source-legacy" aria-hidden="true">{definition?.icon}</span><SourceIcon sourceId={source.sourceId} size={12}/> {definition?.displayName || source.sourceId}{owner && ` של ${owner}`}</span> })}</div><details className="lia-why"><summary>למה LIA ממליצה על זה? <ChevronDown size={14}/></summary><p>{item.explanation}</p></details></div>
  </article>
}
