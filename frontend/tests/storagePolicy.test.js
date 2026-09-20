// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearSensitiveLocalState,
  ephemeralStorage,
  invalidateLegacySensitiveStorage,
  persistenceNamespace,
} from '@/services/storagePolicy'
import { useWorkspaceScopeStore } from '@/stores/workspaceScopeStore'

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

  it('limpia helios-workspace-scope y el store de alcance de sucursal', () => {
    window.localStorage.setItem('helios-workspace-scope', '{"state":{"activeBranchId":"branch-1"}}')
    useWorkspaceScopeStore.setState({ activeBranchId: 'branch-1' })

    clearSensitiveLocalState()

    expect(window.localStorage.getItem('helios-workspace-scope')).toBeNull()
    expect(useWorkspaceScopeStore.getState().activeBranchId).toBeNull()
  })
})
