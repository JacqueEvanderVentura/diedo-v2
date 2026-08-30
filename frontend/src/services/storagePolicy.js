import { createJSONStorage } from 'zustand/middleware'

const memory = new Map()
const sensitiveStateCleaners = new Set()

export const ephemeralStorage = {
  getItem: (name) => memory.get(name) ?? null,
  setItem: (name, value) => memory.set(name, value),
  removeItem: (name) => memory.delete(name),
}

export const ephemeralJsonStorage = createJSONStorage(() => ephemeralStorage)

const LEGACY_SENSITIVE_KEYS = [
  'diedo-session',
  'diedo-config',
  'diedo-agenda',
  'diedo-pos',
  'diedo-crm',
  'diedo-compras',
  'diedo-finanzas',
  'diedo-rrhh',
  'diedo-incidencias',
  'diedo-notifications',
  'diedo-inventario',
  'diedo-activos',
  'diedo-catalog',
  'diedo-self-booking',
  'diedo-self-doc',
]

export function invalidateLegacySensitiveStorage(storage = window.localStorage) {
  try {
    if (storage.getItem('diedo-storage-policy-version') === '2') return
    LEGACY_SENSITIVE_KEYS.forEach((key) => storage.removeItem(key))
    storage.setItem('diedo-storage-policy-version', '2')
  } catch {
    // Storage can be unavailable in private browsing or hardened environments.
  }
}

export function clearSensitiveLocalState(storage = window.localStorage) {
  try {
    LEGACY_SENSITIVE_KEYS.forEach((key) => storage.removeItem(key))
  } catch {
    // The in-memory cleanup below must still happen when browser storage fails.
  }
  memory.clear()
  sensitiveStateCleaners.forEach((cleaner) => cleaner())
}

export function registerSensitiveStateCleaner(cleaner) {
  sensitiveStateCleaners.add(cleaner)
  return () => sensitiveStateCleaners.delete(cleaner)
}

export function persistenceNamespace(workspaceId, userId, module) {
  if (!workspaceId || !userId || !module) throw new Error('El namespace requiere workspace, usuario y módulo.')
  return `diedo:v2:${workspaceId}:${userId}:${module}`
}
