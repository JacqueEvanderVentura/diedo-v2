export function resolveFeatureFlag(value, production = import.meta.env.PROD) {
  if (value === 'true') return true
  if (value === 'false') return false
  return !production
}

export const FEATURES = Object.freeze({
  selfBooking: resolveFeatureFlag(import.meta.env.VITE_FEATURE_SELF_BOOKING),
  invitations: resolveFeatureFlag(import.meta.env.VITE_FEATURE_INVITATIONS),
  crmDiscovery: resolveFeatureFlag(import.meta.env.VITE_FEATURE_CRM_DISCOVERY),
  payroll: resolveFeatureFlag(import.meta.env.VITE_FEATURE_PAYROLL),
  performance: resolveFeatureFlag(import.meta.env.VITE_FEATURE_PERFORMANCE),
  notifications: resolveFeatureFlag(import.meta.env.VITE_FEATURE_NOTIFICATIONS),
  calendarSchedules: resolveFeatureFlag(import.meta.env.VITE_FEATURE_CALENDAR_SCHEDULES),
  regionalModules: resolveFeatureFlag(import.meta.env.VITE_FEATURE_REGIONAL_MODULES),
  chat: resolveFeatureFlag(import.meta.env.VITE_FEATURE_CHAT),
})

/** Chat UI when build flag is on or the workspace has the chat module entitled. */
export function isChatModuleSurfaceEnabled(enabledModules = []) {
  if (FEATURES.chat) return true
  const enabled = enabledModules instanceof Set ? enabledModules : new Set(enabledModules)
  return enabled.has('chat')
}
