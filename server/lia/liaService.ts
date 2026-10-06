import { createGroqChatCompletion, type GroqMessage, type GroqToolDefinition } from './groqClient.js'
import { LIA_SYSTEM_PROMPT } from './systemPrompt.js'
import type { LiaReadContext } from '../../src/liaReadContext.js'
import { LIA_READ_TOOLS } from './tools/definitions.js'
import { executeLiaReadTool } from './tools/executeTool.js'

export type LiaToolTrace = { name: string; arguments: unknown; result: unknown }

export async function askLIA(message: string, context?: LiaReadContext, complete = createGroqChatCompletion): Promise<{ reply: string; toolTrace: LiaToolTrace[] }> {
  const messages: GroqMessage[] = [
    { role: 'system', content: LIA_SYSTEM_PROMPT },
    { role: 'user', content: message },
  ]
  const toolTrace: LiaToolTrace[] = []
  for (let turn = 0; turn < 5; turn += 1) {
    const assistant = await complete(messages, context ? LIA_READ_TOOLS as unknown as readonly GroqToolDefinition[] : undefined)
    messages.push(assistant)
    if (!assistant.tool_calls?.length) {
      if (!assistant.content) throw new Error('LIA returned no reply')
      return { reply: assistant.content, toolTrace }
    }
    for (const call of assistant.tool_calls) {
      let args: unknown
      let result: unknown
      try {
        args = JSON.parse(call.function.arguments || '{}')
        result = context ? executeLiaReadTool(call.function.name, args, context) : { error: 'Family data is unavailable' }
      } catch {
        result = { error: 'The requested family information could not be read' }
      }
      toolTrace.push({ name: call.function.name, arguments: args, result })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  throw new Error('LIA tool loop exceeded its limit')
}
