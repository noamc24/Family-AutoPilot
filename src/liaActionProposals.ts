export type LiaUpdateEventTimeProposal = {
  id: string
  type: 'update_event_time'
  familyId: string
  targetId: string
  summary: string
  eventTitle: string
  eventDate: string
  before: { time: string }
  after: { time: string }
  warnings: string[]
  requiresConfirmation: true
}

export type LiaActionProposal = LiaUpdateEventTimeProposal

