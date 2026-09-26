import type { AppData, IntegrationSource } from './data'

export type TrafficSignal = {
  id: string
  familyId: string
  source: Extract<IntegrationSource, 'waze'>
  relatedEventId: string
  previousTravelMinutes: number
  currentTravelMinutes: number
  timestamp: string
  severity: 'minor' | 'meaningful'
}

export const TRAFFIC_CHANGE_THRESHOLD_MINUTES = 10
export const DEPARTURE_BUFFER_MINUTES = 10

export function isMeaningfulTrafficSignal(signal: TrafficSignal) {
  return signal.currentTravelMinutes - signal.previousTravelMinutes >= TRAFFIC_CHANGE_THRESHOLD_MINUTES
}

export function subtractMinutes(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number)
  const total = (hour * 60 + minute - minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function recommendedDepartureTime(eventTime: string, travelMinutes: number, bufferMinutes = DEPARTURE_BUFFER_MINUTES) {
  return subtractMinutes(eventTime, travelMinutes + bufferMinutes)
}

export function memberAllowsSource(data: AppData, familyId: string, personId: string, sourceId: IntegrationSource) {
  const integration = data.families.find(family => family.id === familyId)?.people.find(person => person.id === personId)?.personalSettings?.integrations.find(item => item.sourceId === sourceId)
  return integration?.connectionStatus === 'connected' && integration.liaAccess === 'allowed'
}
