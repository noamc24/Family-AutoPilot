const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const LIA_MODEL = 'openai/gpt-oss-20b'

export type GroqMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type GroqChatResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

export class GroqConfigurationError extends Error {}
export class GroqRequestError extends Error {}

export async function createGroqChatCompletion(messages: GroqMessage[]): Promise<string> {
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

  const reply = data.choices?.[0]?.message?.content?.trim()
  if (!reply) throw new GroqRequestError('Groq returned an empty response')
  return reply
}
