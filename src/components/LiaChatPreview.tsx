import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Clock3, Send, Trash2, X } from 'lucide-react'
import type { LiaConversation, LiaMessage } from '../liaChatTypes'
import { formatDate } from '../dateTime'

type Props = { conversation: LiaConversation; memberName: string; processing: boolean; onSend: (value: string) => void; onQuickPrompt: (value: string) => void; onAction: (message: LiaMessage, decision?: 'approve' | 'reject') => void; onClear: () => void }
export const liaQuickPrompts = ['מה דורש טיפול היום?', 'מה יש לי היום?', 'מי פנוי להסעה?', 'מה כבר טופל?']

function MessageText({ text }: { text: string }) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const list = lines.slice(1).filter(line => /^(?:\d+\.|•)\s*/.test(line))
  if (lines.length > 1 && list.length === lines.length - 1) return <><p>{lines[0]}</p><ul className="lia-message-list">{list.map((line, index) => <li key={`${index}:${line}`}>{line.replace(/^(?:\d+\.|•)\s*/, '')}</li>)}</ul></>
  return <p>{text}</p>
}

function ActionCard({ message, onAction }: { message: LiaMessage; onAction: (decision?: 'approve' | 'reject') => void }) {
  const [submitting, setSubmitting] = useState(false)
  if (!message.action) return null
  const name = message.text.match(/מצאתי את ([^\s,.]+)/)?.[1] || message.text.match(/^([^\s,.]+)/)?.[1] || 'בן משפחה'
  const state = message.status || 'sent'
  const proposal = message.action.proposal
  const decision = message.action.kind === 'liaDecision' || !!proposal
  const stateCopy = state === 'completed' ? decision ? 'הפעולה בוצעה' : 'הבקשה נשלחה' : state === 'failed' ? decision ? 'הפעולה לא בוצעה' : 'הבקשה לא נשלחה' : state === 'dismissed' ? decision ? 'הפעולה בוטלה' : 'לא נשלחה בקשה' : decision ? 'ממתין לאישור שלך' : 'מוכן לשליחה'
  const StateIcon = state === 'completed' ? Check : state === 'failed' || state === 'dismissed' ? X : Clock3
  if (proposal) {
    const ProposalIcon = state === 'completed' ? Check : state === 'failed' ? AlertTriangle : state === 'dismissed' ? X : Clock3
    const decide = (next: 'approve' | 'reject') => { if (submitting) return; setSubmitting(true); onAction(next) }
    const accessibleDetails = proposal.type === 'update_event_time' ? `${proposal.before.time} עד ${proposal.after.time}` : proposal.type === 'create_event' ? `${proposal.title}, ${proposal.participant.name}, ${proposal.date}, ${proposal.time}` : proposal.type === 'create_task' ? `${proposal.title}, ${proposal.assignee.name}, ${proposal.due}` : `${proposal.event.title}, ${proposal.passenger.name}, ${proposal.before.driver?.name || 'ללא נהג או נהגת'} עד ${proposal.after.driver.name}, ${proposal.event.date}, ${proposal.event.time}`
    return <div className={`lia-chat-action-card lia-proposal-card state-${state}`} aria-label={`${proposal.summary}, ${accessibleDetails}`}>
      <div className="lia-proposal-heading">
        <span className="lia-proposal-icon" aria-hidden="true"><ProposalIcon size={16}/></span>
        <div><strong>{proposal.summary}</strong>{state === 'sent' && <small>הצעה שממתינה לאישור</small>}</div>
      </div>
      {proposal.type === 'update_event_time' ? <div className="lia-proposal-transition" dir="ltr" aria-label={`משעה ${proposal.before.time} לשעה ${proposal.after.time}`}><bdi className="lia-proposal-before">{proposal.before.time}</bdi><span aria-hidden="true">→</span><bdi className="lia-proposal-after">{proposal.after.time}</bdi></div> : proposal.type === 'create_event' ? <div className="lia-proposal-details"><strong>{proposal.title}</strong><span>{proposal.participant.name}</span><small>יום {proposal.weekday} · {formatDate(proposal.date)} · <bdi dir="ltr">{proposal.time}{proposal.endTime ? `–${proposal.endTime}` : ''}</bdi></small></div> : proposal.type === 'create_task' ? <div className="lia-proposal-details"><strong>{proposal.title}</strong><span>{proposal.assignee.name}</span><small>ליום {proposal.weekday} · {formatDate(proposal.due)}</small></div> : <><div className="lia-proposal-details"><strong>{proposal.event.title}</strong><span>{proposal.passenger.name}</span><small>{formatDate(proposal.event.date)} · <bdi dir="ltr">{proposal.event.time}</bdi></small></div><div className="lia-proposal-transition" aria-label={`מ${proposal.before.driver?.name || 'ללא שיבוץ'} ל${proposal.after.driver.name}`}><bdi className="lia-proposal-before">{proposal.before.driver?.name || 'ללא שיבוץ'}</bdi><span aria-hidden="true">→</span><bdi className="lia-proposal-after">{proposal.after.driver.name}</bdi></div></>}
      {proposal.warnings.length > 0 && <div className="lia-proposal-warning"><AlertTriangle size={14}/><div><strong>כדאי לדעת</strong><span>{proposal.warnings.join('; ')}</span></div></div>}
      {state === 'sent' ? <div className="lia-proposal-actions"><button className="dark-button lia-proposal-approve" disabled={submitting} onClick={() => decide('approve')} aria-label={`אישור ${proposal.summary}`}>אישור</button><button className="secondary-button" disabled={submitting} onClick={() => decide('reject')} aria-label={`ביטול ${proposal.summary}`}>ביטול</button></div> : <div className="lia-proposal-resolution"><ProposalIcon size={14}/><span>{stateCopy}</span></div>}
    </div>
  }
  return <div className={`lia-chat-action-card state-${state}`}>
    <div className="lia-action-person"><span>{decision ? '✓' : name.slice(0, 1)}</span><div><strong>{decision ? 'המלצת LIA' : name}</strong><small>{message.action.kind === 'sendRideRequest' ? 'הזמינות מתאימה להסעה' : decision ? 'פעולה אמיתית ב־FamPilot' : 'פעולה ביומן'}</small></div></div>
    <div className="lia-action-meta"><span>לפי הזמינות</span><span>לפי הלו״ז המשפחתי</span></div>
    {state === 'sent' ? <button onClick={() => onAction()}>{message.action.label}</button> : <div className="lia-action-state"><StateIcon size={14}/>{stateCopy}</div>}
  </div>
}

export function LiaChatPreview({ conversation, processing, onSend, onQuickPrompt, onAction, onClear }: Props) {
  const [value, setValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const wasNearBottom = useRef(true)
  const messages = conversation.messages
  useEffect(() => { const element = scrollRef.current; if (element && wasNearBottom.current) element.scrollTo({ top: element.scrollHeight, behavior: messages.length > 2 ? 'smooth' : 'auto' }) }, [messages.length, processing])
  const resizeComposer = () => { const element = composerRef.current; if (!element) return; element.style.height = 'auto'; element.style.height = `${Math.min(element.scrollHeight, 128)}px` }
  const submit = (text = value) => { const trimmed = text.trim(); if (!trimmed || processing) return; setValue(''); wasNearBottom.current = true; onSend(trimmed); requestAnimationFrame(resizeComposer) }
  return <section className="lia-chat-shell" aria-label="שיחה עם LIA">
    <header className="lia-chat-header"><span className="lia-header-mark" aria-hidden="true">✦</span><div><h1>LIA</h1><p>העוזרת המשפחתית שלך</p></div>{messages.length > 0 && <button className="lia-clear-chat" onClick={onClear} aria-label="ניקוי השיחה"><Trash2 size={15}/><span>נקה שיחה</span></button>}</header>
    <div className="lia-conversation" ref={scrollRef} aria-live="polite" onScroll={event => { const element = event.currentTarget; wasNearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90 }}>
      {!messages.length && <div className="lia-chat-welcome"><span aria-hidden="true">✦</span><h2>איך אפשר לעזור?</h2><p>אפשר לשאול על הלו״ז, משימות, הסעות ומה דורש טיפול.</p></div>}
      {messages.map(item => <article className={`lia-chat-message ${item.sender}`} key={item.id} data-message-type={item.type} data-status={item.status}>{item.sender === 'lia' && <span className="lia-message-mark" aria-hidden="true">✦</span>}<div className="lia-message-bubble">{!item.action?.proposal && <MessageText text={item.text}/>}<ActionCard message={item} onAction={decision => onAction(item, decision)}/></div></article>)}
      {processing && <div className="lia-chat-message lia"><span className="lia-message-mark" aria-hidden="true">✦</span><div className="lia-typing" aria-label="LIA מקלידה"><i/><i/><i/></div></div>}
    </div>
    {!messages.length && <div className="lia-quick-prompts">{liaQuickPrompts.map(item => <button key={item} disabled={processing} onClick={() => { if (!processing) onQuickPrompt(item) }}>{item}</button>)}</div>}
    <div className="lia-composer"><textarea ref={composerRef} rows={1} value={value} onChange={event => { setValue(event.target.value); resizeComposer() }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} placeholder="שאלו את LIA..." aria-label="שאלו את LIA"/><button disabled={!value.trim() || processing} onClick={() => submit()} aria-label="שליחה ל־LIA"><Send size={17}/><span>שליחה</span></button></div>
  </section>
}
