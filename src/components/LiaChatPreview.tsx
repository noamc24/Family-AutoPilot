import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, Trash2 } from 'lucide-react'
import type { LiaConversation, LiaMessage } from '../liaChatTypes'

type Props = { conversation: LiaConversation; memberName: string; processing: boolean; onSend: (value: string) => void; onAction: (message: LiaMessage) => void; onClear: () => void }
export const liaQuickPrompts = ['מה דורש טיפול היום?', 'מה יש לי היום?', 'מי פנוי להסעה?', 'מה ליה כבר טיפלה?']

export function LiaChatPreview({ conversation, memberName, processing, onSend, onAction, onClear }: Props) {
  const [value, setValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const wasNearBottom = useRef(true)
  const messages = conversation.messages
  useEffect(() => { const element = scrollRef.current; if (element && wasNearBottom.current) element.scrollTo({ top: element.scrollHeight, behavior: messages.length > 2 ? 'smooth' : 'auto' }) }, [messages.length, processing])
  const submit = (text = value) => { const trimmed = text.trim(); if (!trimmed || processing) return; setValue(''); wasNearBottom.current = true; onSend(trimmed) }
  return <section className="lia-chat-shell" aria-label="שיחה עם ליה">
    <header className="lia-chat-header"><span className="lia-orb"><Sparkles size={22}/></span><div><span>LIA · Life Intelligence Assistant</span><h1>ליה</h1><p>העוזרת המשפחתית של {memberName}</p></div>{messages.length > 0 && <button className="lia-clear-chat" onClick={onClear}><Trash2 size={15}/> נקה שיחה</button>}</header>
    <div className="lia-conversation" ref={scrollRef} aria-live="polite" onScroll={event => { const element = event.currentTarget; wasNearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90 }}>
      {!messages.length && <div className="lia-chat-welcome"><span className="lia-mini-orb"><Sparkles size={16}/></span><h2>איך אפשר לעזור?</h2><p>אפשר לשאול על הלו״ז, משימות, הסעות ומה דורש טיפול.</p></div>}
      {messages.map(item => <article className={`lia-chat-message ${item.sender}`} key={item.id} data-message-type={item.type}>{item.sender === 'lia' && <span className="lia-mini-orb"><Sparkles size={13}/></span>}<div className="lia-message-bubble"><p>{item.text}</p>{item.action && item.status !== 'completed' && <div className="lia-chat-action-card"><strong>{item.action.kind === 'sendRideRequest' ? 'בקשת הסעה' : 'אירוע ביומן'}</strong><button onClick={() => onAction(item)}>{item.action.label}</button></div>}</div></article>)}
      {processing && <div className="lia-chat-message lia"><span className="lia-mini-orb"><Sparkles size={13}/></span><div className="lia-typing" aria-label="ליה מקלידה"><i/><i/><i/></div></div>}
    </div>
    {!messages.length && <div className="lia-quick-prompts">{liaQuickPrompts.map(item => <button key={item} onClick={() => submit(item)}>{item}</button>)}</div>}
    <div className="lia-composer"><textarea value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} placeholder="שאלו את ליה..." aria-label="שאלו את ליה"/><button disabled={!value.trim() || processing} onClick={() => submit()} aria-label="שליחה לליה"><Send size={18}/><span>שליחה</span></button></div>
  </section>
}
