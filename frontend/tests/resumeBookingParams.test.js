import { describe, expect, it } from 'vitest'
import { mergeResumeBookingIntoForm, readResumeBookingParams } from '../src/modules/agenda/lib/resumeBookingParams'

describe('resume booking query params', () => {
  it('reads service, employee, date and time from the URL', () => {
    const params = new URLSearchParams(
      'service=svc-1&employee=emp-2&date=2026-12-01&time=10:30',
    )
    expect(readResumeBookingParams(params)).toEqual({
      serviceId: 'svc-1',
      employeeId: 'emp-2',
      date: '2026-12-01',
      time: '10:30',
    })
  })

  it('overrides form fields when resuming an abandoned hold', () => {
    const merged = mergeResumeBookingIntoForm(
      { serviceId: '', employeeId: '', date: '2026-01-01', time: '' },
      { serviceId: 'svc-1', employeeId: 'emp-2', date: '2026-12-01', time: '10:30' },
    )
    expect(merged).toEqual({
      serviceId: 'svc-1',
      employeeId: 'emp-2',
      date: '2026-12-01',
      time: '10:30',
    })
  })
})