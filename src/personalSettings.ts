import { normalizePersonalSettings, type IntegrationSource, type PersonalSettings } from './data'

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

export function updateNotifications(settings: PersonalSettings, enabled: boolean): PersonalSettings {
  const normalized = normalizePersonalSettings(settings)
  return { ...normalized, notifications: { enabled } }
}

export function updateProactiveSuggestions(settings: PersonalSettings, enabled: boolean): PersonalSettings {
  const normalized = normalizePersonalSettings(settings)
  return { ...normalized, lia: { ...normalized.lia, proactiveSuggestions: enabled } }
}
