import { localDate, type AppData, type IntegrationSource } from './data'

export type FeedEntry = { id: string; text: string; createdAt: string; source?: IntegrationSource; personId?: string }

const dayOf = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function activityFeed(data: AppData, familyId: string, day = localDate(), limit = 15): FeedEntry[] {
  const actions = data.activity.filter(item => item.familyId === familyId && item.createdAt && dayOf(item.createdAt) === day)
    .map(item => ({ id: `activity:${item.id}`, text: item.text, createdAt: item.createdAt!, source: item.source, personId: item.personIds[0] }))
  const updates = data.integrationLogs.filter(item => item.familyId === familyId && dayOf(item.createdAt) === day)
    .map(item => ({ id: `integration:${item.id}`, text: item.action, createdAt: item.createdAt, source: item.source, personId: item.personIds[0] }))
  const updateKeys = new Set(updates.map(item => `${item.createdAt}:${item.text}`))
  return [...actions.filter(item => !updateKeys.has(`${item.createdAt}:${item.text}`)), ...updates]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
    .slice(0, limit)
}
