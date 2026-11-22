import { describe, expect, it } from 'vitest'
import { formatHoldCountdown, holdRemainingMs } from '@/modules/agenda/lib/slotHoldCountdown'

describe('slot hold countdown', () => {
  it('formats minutes and seconds with leading zero', () => {
    const now = Date.parse('2027-01-01T12:00:00.000Z')
    const expires = new Date(now + 9 * 60 * 1000 + 59 * 1000).toISOString()
    expect(formatHoldCountdown(expires, now)).toBe('9:59')
  })

  it('never returns negative remaining time', () => {
    const now = Date.now()
    const expires = new Date(now - 5000).toISOString()
    expect(holdRemainingMs(expires, now)).toBe(0)
    expect(formatHoldCountdown(expires, now)).toBe('0:00')
  })
})