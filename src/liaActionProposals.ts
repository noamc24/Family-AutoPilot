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

export type LiaCreateEventProposal = {
  id: string
  type: 'create_event'
  familyId: string
  summary: string
  title: string
  date: string
  weekday: string
  time: string
  endTime: string | null
  participant: { id: string; name: string }
  warnings: string[]
  requiresConfirmation: true
}

export type LiaCreateTaskProposal = {
  id: string
  type: 'create_task'
  familyId: string
  summary: string
  title: string
  due: string
  weekday: string
  assignee: { id: string; name: string }
  warnings: string[]
  requiresConfirmation: true
}

export type LiaAssignRideDriverProposal = {
  id: string
  type: 'assign_ride_driver'
  familyId: string
  summary: string
  requestId: string
  event: { id: string; title: string; date: string; time: string }
  passenger: { id: string; name: string }
  before: { driver: { id: string; name: string } | null }
  after: { driver: { id: string; name: string } }
  warnings: string[]
  requiresConfirmation: true
}

export type LiaActionProposal = LiaUpdateEventTimeProposal | LiaCreateEventProposal | LiaCreateTaskProposal | LiaAssignRideDriverProposal

