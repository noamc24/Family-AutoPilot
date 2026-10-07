import type { LiaActionProposal } from './liaActionProposals'

export type LiaMessageType = 'text' | 'suggestion' | 'entitySummary' | 'actionRequest' | 'actionResult'
export type LiaMessageStatus = 'sent' | 'completed' | 'dismissed' | 'failed'

export type LiaChatAction = {
  kind: 'sendRideRequest' | 'openCalendar' | 'liaDecision' | 'actionProposal'
  label: string
  eventId?: string
  memberId?: string
  interventionId?: string
  decision?: 'approve' | 'addToCalendar' | 'createTask' | 'dismiss' | 'reassign'
  proposal?: LiaActionProposal
}

export type LiaMessage = {
  id: string
  sender: 'user' | 'lia'
  type: LiaMessageType
  text: string
  createdAt: string
  relatedEntityIds?: string[]
  action?: LiaChatAction
  status?: LiaMessageStatus
}

export type LiaPendingIntent = {
  type: 'sendRideRequest'
  relatedEventId: string
  suggestedMemberId: string
  proposedAction: 'sendRideRequest'
} | {
  type: 'liaInterventionAction'
  interventionId: string
  proposedAction: 'approve' | 'addToCalendar' | 'createTask' | 'dismiss' | 'reassign'
  targetMemberId?: string
}

export type LiaConversationContext = {
  pendingIntent?: LiaPendingIntent
  lastEventId?: string
  lastMemberId?: string
  lastInterventionId?: string
  lastActivityId?: string
  lastSourceId?: string
  lastIntent?: string
  previousIntent?: string
  lastTaskId?: string
  lastRideId?: string
  lastResultIds?: string[]
  candidateMemberIds?: string[]
  excludedMemberIds?: string[]
  temporalScope?: {
    kind: 'today' | 'tomorrow' | 'week' | 'nextWeek' | 'upcoming'
    dayPart?: 'morning' | 'afternoon' | 'evening' | 'night'
  }
  referenceKind?: 'member' | 'event' | 'task' | 'ride' | 'intervention' | 'activity'
  previousTopic?: {
    memberId?: string
    eventId?: string
    taskId?: string
    rideId?: string
    interventionId?: string
    intent?: string
    resultIds?: string[]
    referenceKind?: 'member' | 'event' | 'task' | 'ride' | 'intervention' | 'activity'
    temporalScope?: LiaConversationContext['temporalScope']
  }
  pendingClarification?: {
    kind: 'event'
    candidateIds: string[]
    requestedField: 'time' | 'location' | 'details'
  }
  lastRelevantMessageCount?: number
}

export type LiaConversation = {
  id: string
  familyId: string
  memberId: string
  messages: LiaMessage[]
  createdAt: string
  updatedAt: string
  contextState?: LiaConversationContext
}
