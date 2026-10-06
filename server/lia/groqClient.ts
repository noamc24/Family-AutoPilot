const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const LIA_MODEL = 'openai/gpt-oss-20b'

export type GroqToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
export type GroqMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

type GroqChatResponse = { choices?: Array<{ message?: { content?: string | null; tool_calls?: GroqToolCall[] } }> }
export type GroqToolDefinition = { type: 'function'; function: { name: string; description: string; parameters: unknown } }
export type GroqPhase = 'initial response' | 'tool loop' | 'proposal correction'
type GroqOptions = { fetchImpl?: typeof fetch; sleep?: (milliseconds: number) => Promise<void>; phase?: GroqPhase }

export class GroqConfigurationError extends Error {}
export class GroqRequestError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string) { super(message) }
}

const retryDelay = (response: Response) => {
  const value = response.headers.get('retry-after')
  if (!value) return 250
  const seconds = Number(value)
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now()
  return milliseconds >= 0 && milliseconds <= 2000 ? milliseconds : 250
}

const providerError = async (response: Response) => {
  try {
    const data = await response.json() as { error?: { message?: unknown; code?: unknown; type?: unknown } }
    const message = typeof data.error?.message === 'string' ? data.error.message.slice(0, 300) : undefined
    const codeValue = data.error?.code ?? data.error?.type
    return { message, code: typeof codeValue === 'string' ? codeValue.slice(0, 100) : undefined }
  } catch { return {} }
}

export async function createGroqChatCompletion(messages: GroqMessage[], tools?: readonly GroqToolDefinition[], options: GroqOptions = {}): Promise<Extract<GroqMessage, { role: 'assistant' }>> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) throw new GroqConfigurationError('GROQ_API_KEY is not configured')

  const fetchImpl = options.fetchImpl || fetch
  const sleep = options.sleep || ((milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds)))
  let response: Response | undefined
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchImpl(GROQ_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: LIA_MODEL, messages, ...(tools?.length ? { tools, tool_choice: 'auto' } : {}) }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      if (attempt === 0) { await sleep(250); continue }
      throw new GroqRequestError('Could not reach Groq')
    }
    if (response.ok) break
    const details = await providerError(response)
    if (response.status === 400) console.error('Groq request rejected', { status: response.status, code: details.code, message: details.message, phase: options.phase || 'initial response' })
    const transient = response.status === 429 || response.status >= 500 && response.status <= 599
    if (transient && attempt === 0) { await sleep(retryDelay(response)); continue }
    throw new GroqRequestError(`Groq request failed with status ${response.status}`, response.status, details.code)
  }
  if (!response?.ok) throw new GroqRequestError('Groq request failed')

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
