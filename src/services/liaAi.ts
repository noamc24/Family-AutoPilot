import type { LiaReadContext } from '../liaReadContext'
import type { LiaActionProposal } from '../liaActionProposals'

type LiaChatResponse = {
  reply?: string
  proposal?: LiaActionProposal
  error?: string
}

export async function askLiaAI(message: string, context?: LiaReadContext): Promise<{ reply: string; proposal?: LiaActionProposal }> {
  const text = message.trim()
  if (!text) throw new Error('Message is required')

  let response: Response
  try {
    response = await fetch('/api/lia/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, context }),
    })
  } catch {
    throw new Error('Could not connect to LIA AI')
  }

  const data = await response.json().catch(() => ({})) as LiaChatResponse
  if (!response.ok) throw new Error(data.error || 'LIA AI request failed')
  if (!data.reply) throw new Error('LIA AI returned an empty response')
  return { reply: data.reply, proposal: data.proposal }
}
