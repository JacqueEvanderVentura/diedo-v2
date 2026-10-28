import { describe, expect, it } from 'vitest'
import {
  PORTAL_STATUS_FILTERS,
  canManageFromPortal,
  countAppointmentsByStatus,
  filterAppointmentsByStatus,
  nextStatusFilter,
  portalStatusLabel,
  portalStatusTone,
} from '@/modules/portal/lib/appointmentStats'

const appointments = [
  { id: '1', status: 'confirmed' },
  { id: '2', status: 'confirmed' },
  { id: '3', status: 'fulfilled' },
  { id: '4', status: 'cancelled' },
  { id: '5', status: 'no_show' },
  { id: '6', status: 'cancelled' },
]

describe('portal appointment stats', () => {
  it('counts pending, completed, cancelled and no-show appointments', () => {
    expect(countAppointmentsByStatus(appointments)).toEqual({
      confirmed: 2,
      fulfilled: 1,
      cancelled: 2,
      no_show: 1,
    })
    expect(countAppointmentsByStatus(null)).toEqual({
      confirmed: 0,
      fulfilled: 0,
      cancelled: 0,
      no_show: 0,
    })
    expect(PORTAL_STATUS_FILTERS.map((item) => item.label)).toEqual([
      'Pendientes',
      'Completadas',
      'Canceladas',
      'No-show',
    ])
  })

  it('filters by status and toggles the active filter off', () => {
    expect(filterAppointmentsByStatus(appointments, 'cancelled').map((item) => item.id)).toEqual(['4', '6'])
    expect(filterAppointmentsByStatus(appointments, null)).toHaveLength(6)
    expect(nextStatusFilter(null, 'no_show')).toBe('no_show')
    expect(nextStatusFilter('no_show', 'no_show')).toBe(null)
    expect(nextStatusFilter('no_show', 'fulfilled')).toBe('fulfilled')
  })

  it('labels every appointment status in Spanish', () => {
    expect(portalStatusLabel('confirmed')).toBe('Confirmada')
    expect(portalStatusLabel('fulfilled')).toBe('Completada')
    expect(portalStatusLabel('cancelled')).toBe('Cancelada')
    expect(portalStatusLabel('no_show')).toBe('No asistió')
    expect(portalStatusLabel('otro')).toBe('otro')
    expect(portalStatusTone('fulfilled')).toBe('success')
    expect(portalStatusTone('no_show')).toBe('danger')
    expect(portalStatusTone('otro')).toBe('neutral')
  })

  it('only offers online management for upcoming confirmed appointments', () => {
    const upcoming = { status: 'confirmed', managementToken: 'tok', canManageOnline: true }
    expect(canManageFromPortal(upcoming)).toBe(true)
    expect(canManageFromPortal({ ...upcoming, canManageOnline: false })).toBe(false)
    expect(canManageFromPortal({ ...upcoming, status: 'fulfilled' })).toBe(false)
    expect(canManageFromPortal({ ...upcoming, managementToken: '' })).toBe(false)
  })
})
