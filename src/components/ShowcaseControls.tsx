import { RotateCcw, Sparkles } from 'lucide-react'
import { sourceDefinitionById } from '../sourceDefinitions'
import type { ShowcaseKind } from '../showcaseFlows'

const scenarios: { kind: ShowcaseKind; sourceId: 'whatsapp' | 'school'; title: string; description: string }[] = [
  { kind: 'whatsapp-calendar', sourceId: 'whatsapp', title: 'שינוי בשעת אימון', description: 'עדכון חיצוני הופך להצעה לעדכון היומן.' },
  { kind: 'school-action', sourceId: 'school', title: 'אישור הורים לטיול', description: 'עדכון עם מועד אחרון הופך להצעה למשימה.' },
]

export function ShowcaseControls({ onTraffic }: { onTraffic?: () => void }) {
  const trigger = (kind: ShowcaseKind) => window.dispatchEvent(new CustomEvent('fampilot:showcase-trigger', { detail: { kind } }))
  const reset = () => window.dispatchEvent(new CustomEvent('fampilot:showcase-reset'))
  return <section className="section-card showcase-controls">
    <div className="section-heading"><div><span className="section-kicker">הדגמת מקורות</span><h2>תרחישי Showcase</h2></div><button className="subtle-button" onClick={reset}><RotateCcw size={15}/> איפוס Showcase</button></div>
    <p>כלים להצגת עדכונים נכנסים והאופן שבו LIA מטפלת בהם.</p>
    <div className="showcase-scenarios">{onTraffic && <div><span>{sourceDefinitionById.waze?.icon}</span><div><strong>{sourceDefinitionById.waze?.displayName} · עומס בדרך</strong><small>שינוי בזמן הנסיעה מפעיל את תרחיש התנועה הקיים.</small></div><button className="secondary-button" onClick={onTraffic}><Sparkles size={14}/> הדגם הגעה</button></div>}{scenarios.map(scenario => { const source = sourceDefinitionById[scenario.sourceId]; return <div key={scenario.kind}><span>{source?.icon}</span><div><strong>{source?.displayName} · {scenario.title}</strong><small>{scenario.description}</small></div><button className="secondary-button" onClick={() => trigger(scenario.kind)}><Sparkles size={14}/> הדגם הגעה</button></div> })}</div>
  </section>
}
