// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { publicBookingApi } from '@/services/publicBookingApi'

afterEach(() => vi.unstubAllGlobals())

it('sends availability query parameters directly rather than an object named params', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slots: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  await publicBookingApi.listSlots('branch', { employeeId: 'employee', date: '2027-02-15', serviceId: 'service' })
  const url = new URL(fetch.mock.calls[0][0], 'http://localhost')
  expect(Object.fromEntries(url.searchParams)).toEqual({ employeeId: 'employee', date: '2027-02-15', serviceId: 'service' })
  expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
})

it('omits employeeId from slot queries when cualquiera disponible is selected', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slots: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  await publicBookingApi.listSlots('branch', { employeeId: '', date: '2027-02-15', serviceId: 'service' })
  const url = new URL(fetch.mock.calls[0][0], 'http://localhost')
  expect(Object.fromEntries(url.searchParams)).toEqual({ date: '2027-02-15', serviceId: 'service' })
})

it('requests calendar availability without wrapping params', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ days: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  await publicBookingApi.listAvailability('branch', {
    from: '2026-11-01',
    to: '2026-12-12',
    serviceId: 'service',
    employeeId: 'employee',
  })
  const url = new URL(fetch.mock.calls[0][0], 'http://localhost')
  expect(url.pathname).toContain('/api/v1/public/booking/branches/branch/availability')
  expect(Object.fromEntries(url.searchParams)).toEqual({
    from: '2026-11-01',
    to: '2026-12-12',
    serviceId: 'service',
    employeeId: 'employee',
  })
  expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
})

it('omits employeeId from availability queries when cualquiera disponible is selected', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ days: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  await publicBookingApi.listAvailability('branch', {
    from: '2026-11-01',
    to: '2026-12-12',
    serviceId: 'service',
    employeeId: '',
  })
  const url = new URL(fetch.mock.calls[0][0], 'http://localhost')
  expect(Object.fromEntries(url.searchParams)).toEqual({
    from: '2026-11-01',
    to: '2026-12-12',
    serviceId: 'service',
  })
})

it('includes the customer document when asking for public slots', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slots: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  await publicBookingApi.listSlots('branch', {
    date: '2027-02-15',
    serviceId: 'service',
    documentType: 'pasaporte',
    documentId: 'TESTABC',
  })
  const url = new URL(fetch.mock.calls[0][0], 'http://localhost')
  expect(Object.fromEntries(url.searchParams)).toEqual({
    date: '2027-02-15',
    serviceId: 'service',
    documentType: 'pasaporte',
    documentId: 'TESTABC',
  })
})
