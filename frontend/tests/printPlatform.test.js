import { describe, expect, it, vi } from 'vitest'
import { isIOS, prefersPdfOpenInNewTab } from '@/lib/printPlatform'

describe('printPlatform', () => {
  it('detects iPhone user agents', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    expect(isIOS()).toBe(true)
    expect(prefersPdfOpenInNewTab()).toBe(true)
    vi.unstubAllGlobals()
  })

  it('detects desktop Safari', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })
    expect(isIOS()).toBe(false)
    expect(prefersPdfOpenInNewTab()).toBe(true)
    vi.unstubAllGlobals()
  })
})
