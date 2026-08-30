// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearSensitiveLocalState,
  ephemeralStorage,
  invalidateLegacySensitiveStorage,
  persistenceNamespace,
} from '@/services/storagePolicy'

describe('storagePolicy', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearSensitiveLocalState()
  })

  it('invalida una sola vez el storage sensible heredado', () => {
    window.localStorage.setItem('diedo-session', '{"refreshToken":"secreto"}')
    window.localStorage.setItem('diedo-config', '{"users":[{"email":"pii@example.com"}]}')

    invalidateLegacySensitiveStorage()

    expect(window.localStorage.getItem('diedo-session')).toBeNull()
    expect(window.localStorage.getItem('diedo-config')).toBeNull()
    expect(window.localStorage.getItem('diedo-storage-policy-version')).toBe('2')
  })

  it('mantiene datos de negocio solo en memoria y genera namespaces aislados', () => {
    ephemeralStorage.setItem('business', 'temporal')
    expect(ephemeralStorage.getItem('business')).toBe('temporal')
    clearSensitiveLocalState()
    expect(ephemeralStorage.getItem('business')).toBeNull()
    expect(persistenceNamespace('workspace-a', 'user-a', 'catalog')).toBe(
      'diedo:v2:workspace-a:user-a:catalog'
    )
    expect(() => persistenceNamespace(null, 'user-a', 'catalog')).toThrow()
  })
})
