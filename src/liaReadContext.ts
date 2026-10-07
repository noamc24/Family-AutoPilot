import type { AppData, FamilyEvent, FamilyTask, FamilyUnit, TransportationRequest } from './data'

export type LiaReadContext = {
  family: FamilyUnit
  events: FamilyEvent[]
  tasks: FamilyTask[]
  transportationRequests: TransportationRequest[]
  today: string
}

export function createLiaReadContext(data: AppData, familyId: string, today: string): LiaReadContext | undefined {
  const family = data.families.find(item => item.id === familyId)
  if (!family) return undefined
  return {
    family: { ...family, people: family.people.map(({ personalSettings: _privateSettings, ...person }) => person) },
    events: data.events.filter(item => item.familyId === familyId),
    tasks: data.tasks.filter(item => item.familyId === familyId),
    transportationRequests: data.transportationRequests.filter(item => item.familyId === familyId),
    today,
  }
}
