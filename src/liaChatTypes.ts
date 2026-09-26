export type LiaMessageType = 'text' | 'suggestion' | 'entitySummary' | 'actionRequest' | 'actionResult'
export type LiaMessageStatus = 'sent' | 'completed' | 'dismissed' | 'failed'

export type LiaChatAction = {
  kind: 'sendRideRequest' | 'openCalendar'
  label: string
  eventId?: string
  memberId?: string
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
}

export type LiaConversationContext = {
  pendingIntent?: LiaPendingIntent
  lastEventId?: string
  lastMemberId?: string
  lastInterventionId?: string
  lastIntent?: string
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
