import { useEffect, useRef, useState } from 'react'
import { Check, Clock3, Send, Trash2, X } from 'lucide-react'
import type { LiaConversation, LiaMessage } from '../liaChatTypes'

type Props = { conversation: LiaConversation; memberName: string; processing: boolean; onSend: (value: string) => void; onAction: (message: LiaMessage) => void; onClear: () => void }
export const liaQuickPrompts = ['מה דורש טיפול היום?', 'מה יש לי היום?', 'מי פנוי להסעה?', 'מה כבר טופל?']

function MessageText({ text }: { text: string }) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const list = lines.slice(1).filter(line => /^(?:\d+\.|•)\s*/.test(line))
  if (lines.length > 1 && list.length === lines.length - 1) return <><p>{lines[0]}</p><ul className="lia-message-list">{list.map((line, index) => <li key={`${index}:${line}`}>{line.replace(/^(?:\d+\.|•)\s*/, '')}</li>)}</ul></>
  return <p>{text}</p>
}

function ActionCard({ message, onAction }: { message: LiaMessage; onAction: () => void }) {
  if (!message.action) return null
  const name = message.text.match(/מצאתי את ([^\s,.]+)/)?.[1] || message.text.match(/^([^\s,.]+)/)?.[1] || 'בן משפחה'
  const state = message.status || 'sent'
  const decision = message.action.kind === 'liaDecision'
  const stateCopy = state === 'completed' ? decision ? 'הפעולה בוצעה' : 'הבקשה נשלחה' : state === 'failed' ? decision ? 'הפעולה לא בוצעה' : 'הבקשה לא נשלחה' : state === 'dismissed' ? decision ? 'הפעולה בוטלה' : 'לא נשלחה בקשה' : decision ? 'ממתין לאישור שלך' : 'מוכן לשליחה'
  const StateIcon = state === 'completed' ? Check : state === 'failed' || state === 'dismissed' ? X : Clock3
  return <div className={`lia-chat-action-card state-${state}`}>
    <div className="lia-action-person"><span>{decision ? '✓' : name.slice(0, 1)}</span><div><strong>{decision ? 'המלצת LIA' : name}</strong><small>{message.action.kind === 'sendRideRequest' ? 'פנוי/ה ומתאים/ה להסעה' : decision ? 'פעולה אמיתית ב־FamPilot' : 'פעולה ביומן'}</small></div></div>
    <div className="lia-action-meta"><span>לפי הזמינות</span><span>לפי הלו״ז המשפחתי</span></div>
    {state === 'sent' ? <button onClick={onAction}>{message.action.label}</button> : <div className="lia-action-state"><StateIcon size={14}/>{stateCopy}</div>}
  </div>
}

export function LiaChatPreview({ conversation, processing, onSend, onAction, onClear }: Props) {
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
      {messages.map(item => <article className={`lia-chat-message ${item.sender}`} key={item.id} data-message-type={item.type} data-status={item.status}>{item.sender === 'lia' && <span className="lia-message-mark" aria-hidden="true">✦</span>}<div className="lia-message-bubble"><MessageText text={item.text}/><ActionCard message={item} onAction={() => onAction(item)}/></div></article>)}
      {processing && <div className="lia-chat-message lia"><span className="lia-message-mark" aria-hidden="true">✦</span><div className="lia-typing" aria-label="LIA מקלידה"><i/><i/><i/></div></div>}
    </div>
    {!messages.length && <div className="lia-quick-prompts">{liaQuickPrompts.map(item => <button key={item} onClick={() => submit(item)}>{item}</button>)}</div>}
    <div className="lia-composer"><textarea ref={composerRef} rows={1} value={value} onChange={event => { setValue(event.target.value); resizeComposer() }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} placeholder="שאלו את LIA..." aria-label="שאלו את LIA"/><button disabled={!value.trim() || processing} onClick={() => submit()} aria-label="שליחה ל־LIA"><Send size={17}/><span>שליחה</span></button></div>
  </section>
}
