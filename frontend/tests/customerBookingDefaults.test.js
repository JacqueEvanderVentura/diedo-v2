import { describe, expect, it } from 'vitest'
import { applyBranchBookingDefaults } from '@/modules/agenda/lib/customerBookingDefaults'

describe('applyBranchBookingDefaults', () => {
  it('prefills service and employee only when they exist in the branch catalog', () => {
    const form = { serviceId: '', employeeId: '', time: '' }
    const services = [{ id: 'svc-1', name: 'Facial' }]
    const bookableStaff = [{ id: 'emp-1', name: 'Ana' }]

    const filled = applyBranchBookingDefaults(form, {
      serviceId: 'svc-1',
      employeeId: 'emp-1',
    }, { services, bookableStaff })

    expect(filled.serviceId).toBe('svc-1')
    expect(filled.employeeId).toBe('emp-1')
    expect(filled.time).toBe('')
  })

  it('ignores ids that are not available in the branch', () => {
    const form = { serviceId: '', employeeId: '' }
    const filled = applyBranchBookingDefaults(form, {
      serviceId: 'missing',
      employeeId: 'missing',
    }, { services: [], bookableStaff: [] })

    expect(filled.serviceId).toBe('')
    expect(filled.employeeId).toBe('')
  })
})
