import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { sourceDefinitionById } from '../sourceDefinitions'
import { liaStatusLabels, type LiaActionKind, type LiaIntervention } from '../liaInterventions'

export function LiaCard({ item, onAction }: { item: LiaIntervention; onAction: (action: LiaActionKind) => void }) {
  return <article className={`lia-card lia-card-${item.status}`}>
    <div className="lia-card-head"><span className="lia-mark"><Sparkles size={18}/></span><div><span className="lia-card-kicker">{item.type === 'traffic' ? 'תזמון והגעה' : item.type === 'message' ? 'עדכון שזוהה' : 'תיאום משפחתי'}</span><h3>{item.title}</h3></div><span className="lia-status"><Check size={13}/>{item.statusDetail || liaStatusLabels[item.status]}</span></div>
    <p className="lia-detected">{item.detectedChange}</p>
    <div className="lia-context"><span>למה זה חשוב</span><p>{item.whyItMatters}</p></div>
    {item.recommendation && <div className="lia-recommendation"><Sparkles size={15}/><div><span>LIA ממליצה</span><strong>{item.recommendation}</strong></div></div>}
    {item.actions.length > 0 && <div className="lia-actions">{item.actions.map(action => <button key={action.id} className={action.primary ? 'dark-button' : 'secondary-button'} onClick={() => onAction(action.kind)}>{action.label}</button>)}</div>}
    <div className="lia-card-foot"><div className="lia-sources"><span>מקורות:</span>{item.sources.map(source => { const definition = sourceDefinitionById[source.sourceId]; return <span className="lia-source" key={source.sourceId}>{definition?.icon} {definition?.displayName || source.sourceId}{source.mode === 'demo' && <small>Demo</small>}</span> })}</div><details className="lia-why"><summary>למה LIA ממליצה על זה? <ChevronDown size={14}/></summary><p>{item.explanation}</p></details></div>
  </article>
}
