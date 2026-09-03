import { describe, expect, it } from 'vitest'
import { buildShareCardModel } from '@/modules/agenda/lib/shareCard'

const appointment = {
  customerName: 'Ana Cristina Vargas',
  customerPhone: '829-555-0110',
  date: '2026-09-02',
  time: '10:00',
  duration: 60,
  serviceName: '1 sesión piernas completas',
  price: 1200,
  createdBy: 'Alex Demo',
  updatedBy: 'Local Owner',
}

const modelOptions = {
  staffName: 'Loreinni Rosario',
  statusLabel: 'Pendiente',
  proximo: false,
}

describe('tarjeta compartible de una cita', () => {
  it('omite por defecto los datos internos de auditoría en la imagen para el cliente', () => {
    const model = buildShareCardModel(appointment, modelOptions)

    expect(model.showAudit).toBe(false)
    expect(model.createdBy).toBeUndefined()
    expect(model.updatedBy).toBeUndefined()
  })

  it('conserva los datos de auditoría cuando una vista interna los solicita', () => {
    const model = buildShareCardModel(appointment, { ...modelOptions, showAudit: true })

    expect(model.showAudit).toBe(true)
    expect(model.createdBy).toBe('Alex Demo')
    expect(model.updatedBy).toBe('Local Owner')
  })
})
