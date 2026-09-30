import { normalizePersonalSettings, type IntegrationSource, type NotificationPreferences, type PersonalSettings } from './data'

export function updateConnection(settings: PersonalSettings, sourceId: IntegrationSource, connected: boolean): PersonalSettings {
  const normalized = normalizePersonalSettings(settings)
  return {
    ...normalized,
    integrations: normalized.integrations.map(item => item.sourceId === sourceId
      ? { ...item, connectionStatus: connected ? 'connected' : 'disconnected', mode: 'demo' }
      : item),
  }
}

export function updateLiaAccess(settings: PersonalSettings, sourceId: IntegrationSource, allowed: boolean): PersonalSettings {
  const normalized = normalizePersonalSettings(settings)
  return {
    ...normalized,
    integrations: normalized.integrations.map(item => item.sourceId === sourceId
      ? { ...item, liaAccess: allowed ? 'allowed' : 'notAllowed' }
      : item),
  }
}

export type OptionalNotificationCategory = Exclude<keyof NotificationPreferences, 'enabled'>

export function updateNotifications(settings: PersonalSettings, category: OptionalNotificationCategory, enabled: boolean): PersonalSettings {
  const normalized = normalizePersonalSettings(settings)
  const notifications = { ...normalized.notifications, [category]: enabled }
  return { ...normalized, notifications: { ...notifications, enabled: notifications.importantChanges || notifications.liaUpdates || notifications.routineUpdates } }
}

export function notificationPreferenceAllows(settings: PersonalSettings | undefined, category: OptionalNotificationCategory) {
  return normalizePersonalSettings(settings).notifications[category]
}

export function updateProactiveSuggestions(settings: PersonalSettings, enabled: boolean): PersonalSettings {
  const normalized = normalizePersonalSettings(settings)
  return { ...normalized, lia: { ...normalized.lia, proactiveSuggestions: enabled } }
}

export function proactiveSuggestionsEnabled(settings: PersonalSettings | undefined) {
  return normalizePersonalSettings(settings).lia.proactiveSuggestions
}
