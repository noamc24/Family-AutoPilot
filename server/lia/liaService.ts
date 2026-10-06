import { createGroqChatCompletion } from './groqClient.js'
import { LIA_SYSTEM_PROMPT } from './systemPrompt.js'

export function askLIA(message: string): Promise<string> {
  return createGroqChatCompletion([
    { role: 'system', content: LIA_SYSTEM_PROMPT },
    { role: 'user', content: message },
  ])
}
