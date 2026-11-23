import { describe, expect, it } from 'vitest'
import { buildShareCardModel } from '@/modules/agenda/lib/shareCard'

const baseAppointment = {
  customerName: 'Ana Cristina Vargas',
  customerPhone: '829-555-0110',
  date: '2026-09-02',
  time: '10:00',
  duration: 60,
  serviceName: '1 sesión piernas completas',
  price: 1200,
  createdBy: 'Alex Demo',
  createdAt: '2026-09-01T10:00:00.000Z',
}

const appointmentNeverEdited = {
  ...baseAppointment,
  updatedBy: 'Local Owner',
  updatedAt: '2026-09-01T10:00:00.000Z',
  history: [{ action: 'create', at: '2026-09-01T10:00:00.000Z' }],
}

const appointmentEdited = {
  ...baseAppointment,
  updatedBy: 'Local Owner',
  updatedAt: '2026-09-02T12:00:00.000Z',
  history: [
    { action: 'create', at: '2026-09-01T10:00:00.000Z' },
    { action: 'update', at: '2026-09-02T12:00:00.000Z' },
  ],
}

const modelOptions = {
  staffName: 'Loreinni Rosario',
  statusLabel: 'Pendiente',
  proximo: false,
}

describe('tarjeta compartible de una cita', () => {
  it('omite por defecto los datos internos de auditoría en la imagen para el cliente', () => {
    const model = buildShareCardModel(appointmentEdited, modelOptions)

    expect(model.showAudit).toBe(false)
    expect(model.createdBy).toBeUndefined()
    expect(model.updatedBy).toBeUndefined()
  })

  it('conserva creador pero omite última modificación si no hubo edición', () => {
    const model = buildShareCardModel(appointmentNeverEdited, { ...modelOptions, showAudit: true })

    expect(model.showAudit).toBe(true)
    expect(model.createdBy).toBe('Alex Demo')
    expect(model.updatedBy).toBeUndefined()
    expect(model.updatedAt).toBeUndefined()
  })

  it('conserva última modificación cuando hubo edición real', () => {
    const model = buildShareCardModel(appointmentEdited, { ...modelOptions, showAudit: true })

    expect(model.showAudit).toBe(true)
    expect(model.createdBy).toBe('Alex Demo')
    expect(model.updatedBy).toBe('Local Owner')
    expect(model.updatedAt).toBe('2026-09-02T12:00:00.000Z')
  })
})
