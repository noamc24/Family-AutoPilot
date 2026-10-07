import { createGroqChatCompletion, type GroqMessage, type GroqToolDefinition } from './groqClient.js'
import { LIA_SYSTEM_PROMPT } from './systemPrompt.js'
import type { LiaReadContext } from '../../src/liaReadContext.js'
import type { LiaActionProposal } from '../../src/liaActionProposals.js'
import { LIA_PROPOSAL_TOOL_NAMES, LIA_TOOLS } from './tools/definitions.js'
import { executeLiaReadTool } from './tools/executeTool.js'
import { createActionProposal } from './tools/proposalTools.js'

export type LiaToolTrace = { name: string; arguments: unknown; result: unknown }

const eventTimeChangeRequest = (message: string) => /(?:אימון|חוג|תור|פגישה|אירוע)/u.test(message)
  && /(?:^|\s)ל(?:־|-)?\s*(?:[01]?\d|2[0-3])(?::[0-5]\d)?(?:\s|$)|(?:^|\s)ל(?:־|-)?\s*(?:שש|שבע|שמונה|תשע|עשר|אחת(?:־|\s)?עשרה|שתים(?:־|\s)?עשרה)(?:\s+וחצי)?(?:\s|$)/u.test(message)

export async function askLIA(message: string, context?: LiaReadContext, complete = createGroqChatCompletion): Promise<{ reply: string; toolTrace: LiaToolTrace[]; proposal?: LiaActionProposal }> {
  const messages: GroqMessage[] = [
    { role: 'system', content: LIA_SYSTEM_PROMPT },
    { role: 'user', content: message },
  ]
  const toolTrace: LiaToolTrace[] = []
  let phase: 'initial response' | 'tool loop' | 'proposal correction' = 'initial response'
  for (let turn = 0; turn < 5; turn += 1) {
    const assistant = await complete(messages, context ? LIA_TOOLS as unknown as readonly GroqToolDefinition[] : undefined, { phase })
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
        if (eventTimeChangeRequest(message) && ['find_available_drivers', 'propose_assign_ride_driver'].includes(call.function.name)) throw new Error('This request changes an event time, not a driver assignment. Resolve the event and use the event-time proposal flow.')
        if (context && LIA_PROPOSAL_TOOL_NAMES.has(call.function.name as never)) {
          const proposal = createActionProposal(call.function.name, args, context, message)
          toolTrace.push({ name: call.function.name, arguments: args, result: proposal })
          const warning = proposal.warnings.length ? `\nשימי לב: ${proposal.warnings.join('; ')}.` : ''
          const details = proposal.type === 'update_event_time' ? `${proposal.eventTitle}\n${proposal.before.time} → ${proposal.after.time}` : proposal.type === 'create_event' ? `${proposal.title} · ${proposal.participant.name}\n${proposal.date} · ${proposal.time}${proposal.endTime ? `–${proposal.endTime}` : ''}` : proposal.type === 'create_task' ? `${proposal.title}\n${proposal.assignee.name} · ${proposal.due}` : `${proposal.event.title} · ${proposal.passenger.name}\n${proposal.before.driver?.name || 'ללא נהג/ת'} → ${proposal.after.driver.name} · ${proposal.event.date} · ${proposal.event.time}`
          return { reply: `${proposal.summary}\n${details}${warning}`, proposal, toolTrace }
        }
        result = context ? executeLiaReadTool(call.function.name, args, context) : { error: 'Family data is unavailable' }
      } catch (error) {
        result = { error: error instanceof Error ? error.message : 'The requested family information could not be read' }
        if (context && LIA_PROPOSAL_TOOL_NAMES.has(call.function.name as never)) phase = 'proposal correction'
      }
      toolTrace.push({ name: call.function.name, arguments: args, result })
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
    if (phase !== 'proposal correction') phase = 'tool loop'
  }
  throw new Error('LIA tool loop exceeded its limit')
}
