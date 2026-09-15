// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { publicBookingApi } from '@/services/publicBookingApi'

afterEach(() => vi.unstubAllGlobals())

it('sends availability query parameters directly rather than an object named params', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slots: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  await publicBookingApi.listSlots('branch', { employeeId: 'employee', date: '2027-02-15', duration: 45 })
  const url = new URL(fetch.mock.calls[0][0], 'http://localhost')
  expect(Object.fromEntries(url.searchParams)).toEqual({ employeeId: 'employee', date: '2027-02-15', duration: '45' })
  expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
})
