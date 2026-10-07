import { describe, expect, it, vi } from 'vitest'
import {
  checkAndReloadDeploy,
  clearReloadAttempt,
  fetchRemoteBuildId,
  getVersionUrl,
  hasReloadAttempted,
  markReloadAttempted,
  shouldReloadForDeploy,
} from '@/lib/deployReload'

describe('deployReload', () => {
  it('builds version.json URL from base', () => {
    expect(getVersionUrl('/')).toBe('/version.json')
    expect(getVersionUrl('/diedo-v2/')).toBe('/diedo-v2/version.json')
  })

  it('detects when remote build differs', () => {
    expect(shouldReloadForDeploy('abc', 'abc')).toBe(false)
    expect(shouldReloadForDeploy('abc', 'def')).toBe(true)
    expect(shouldReloadForDeploy('', 'def')).toBe(false)
    expect(shouldReloadForDeploy('abc', null)).toBe(false)
  })

  it('parses remote build id', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'sha-1' }),
    })
    await expect(fetchRemoteBuildId('/version.json', fetchFn)).resolves.toBe('sha-1')
    expect(fetchFn).toHaveBeenCalledWith('/version.json', { cache: 'no-store' })
  })

  it('reloads once when deploy is newer', async () => {
    const storage = {
      store: {},
      getItem(key) {
        return this.store[key] ?? null
      },
      setItem(key, value) {
        this.store[key] = value
      },
      removeItem(key) {
        delete this.store[key]
      },
    }
    const reload = vi.fn()
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'new-sha' }),
    })

    const reloaded = await checkAndReloadDeploy({
      currentBuildId: 'old-sha',
      baseUrl: '/',
      fetchFn,
      reload,
      storage,
    })

    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(hasReloadAttempted(storage, 'new-sha')).toBe(true)

    const again = await checkAndReloadDeploy({
      currentBuildId: 'old-sha',
      baseUrl: '/',
      fetchFn,
      reload,
      storage,
    })
    expect(again).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('clears reload guard when versions match', async () => {
    const storage = {
      store: {},
      getItem(key) {
        return this.store[key] ?? null
      },
      setItem(key, value) {
        this.store[key] = value
      },
      removeItem(key) {
        delete this.store[key]
      },
    }
    markReloadAttempted(storage, 'stale-target')
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'same-sha' }),
    })

    await checkAndReloadDeploy({
      currentBuildId: 'same-sha',
      baseUrl: '/',
      fetchFn,
      reload: vi.fn(),
      storage,
    })

    expect(hasReloadAttempted(storage, 'same-sha')).toBe(false)
    clearReloadAttempt(storage)
  })
})
