const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const LIA_MODEL = 'openai/gpt-oss-20b'

export type GroqToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
export type GroqMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

type GroqChatResponse = { choices?: Array<{ message?: { content?: string | null; tool_calls?: GroqToolCall[] } }> }
export type GroqToolDefinition = { type: 'function'; function: { name: string; description: string; parameters: unknown } }

export class GroqConfigurationError extends Error {}
export class GroqRequestError extends Error {}

export async function createGroqChatCompletion(messages: GroqMessage[], tools?: readonly GroqToolDefinition[]): Promise<Extract<GroqMessage, { role: 'assistant' }>> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) throw new GroqConfigurationError('GROQ_API_KEY is not configured')

  let response: Response
  try {
    response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LIA_MODEL,
        messages,
        ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new GroqRequestError('Could not reach Groq')
  }

  if (!response.ok) throw new GroqRequestError(`Groq request failed with status ${response.status}`)

  let data: GroqChatResponse
  try {
    data = await response.json() as GroqChatResponse
  } catch {
    throw new GroqRequestError('Groq returned an invalid response')
  }

  const result = data.choices?.[0]?.message
  if (!result || !result.content?.trim() && !result.tool_calls?.length) throw new GroqRequestError('Groq returned an empty response')
  return { role: 'assistant', content: result.content?.trim() || null, tool_calls: result.tool_calls }
}
