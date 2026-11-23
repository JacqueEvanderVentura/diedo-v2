import { describe, expect, it } from 'vitest'
import { appointmentWasEdited } from '@/modules/agenda/lib/audit'

describe('appointmentWasEdited', () => {
  it('es falso cuando solo hay evento create en historial', () => {
    expect(
      appointmentWasEdited({
        createdAt: '2026-11-23T13:07:00.000Z',
        updatedAt: '2026-11-23T13:07:00.000Z',
        updatedBy: 'Evan',
        history: [{ action: 'create', at: '2026-11-23T13:07:00.000Z' }],
      }),
    ).toBe(false)
  })

  it('es verdadero cuando historial incluye update', () => {
    expect(
      appointmentWasEdited({
        history: [
          { action: 'create', at: '2026-11-23T13:00:00.000Z' },
          { action: 'update', at: '2026-11-23T14:00:00.000Z' },
        ],
      }),
    ).toBe(true)
  })

  it('usa timestamps cuando no hay historial', () => {
    expect(
      appointmentWasEdited({
        createdAt: '2026-11-23T13:00:00.000Z',
        updatedAt: '2026-11-23T13:00:00.000Z',
        updatedBy: 'Evan',
      }),
    ).toBe(false)
    expect(
      appointmentWasEdited({
        createdAt: '2026-11-23T13:00:00.000Z',
        updatedAt: '2026-11-23T14:00:00.000Z',
        updatedBy: 'Evan',
      }),
    ).toBe(true)
  })

  it('es falso sin cita', () => {
    expect(appointmentWasEdited(null)).toBe(false)
    expect(appointmentWasEdited(undefined)).toBe(false)
  })
})