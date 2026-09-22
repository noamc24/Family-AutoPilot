import { localDate, type AppData, type IntegrationSource } from './data'

export type FeedEntry = { id: string; text: string; createdAt: string; source?: IntegrationSource; personId?: string; personName?: string }

const dayOf = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function activityFeed(data: AppData, familyId: string, day = localDate(), limit = 15): FeedEntry[] {
  const family = data.families.find(item => item.id === familyId)
  const names = new Map((family?.people || []).map(person => [person.id, person.name] as const))
  const makeEntry = (item: { id: string; text?: string; action?: string; createdAt?: string; source?: IntegrationSource; personIds?: string[] }) => {
    const text = item.text ?? item.action ?? ''
    const personId = item.personIds?.[0]
    return {
      id: `activity:${item.id}`,
      text,
      createdAt: item.createdAt || '',
      source: item.source,
      personId,
      personName: personId ? names.get(personId) || 'בן משפחה' : undefined,
    }
  }
  const actions = data.activity.filter(item => item.familyId === familyId && item.createdAt && dayOf(item.createdAt) === day)
    .map(item => makeEntry(item))
  const updates = data.integrationLogs.filter(item => item.familyId === familyId && dayOf(item.createdAt) === day)
    .map(item => ({ ...makeEntry(item), id: `integration:${item.id}` }))
  const updateKeys = new Set(updates.map(item => `${item.createdAt}:${item.text}`))
  return [...actions.filter(item => !updateKeys.has(`${item.createdAt}:${item.text}`)), ...updates]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
    .slice(0, limit)
}
