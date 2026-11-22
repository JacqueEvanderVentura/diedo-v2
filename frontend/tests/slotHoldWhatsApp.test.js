import { describe, expect, it } from 'vitest'
import {
  buildSlotHoldWhatsAppMessage,
  slotHoldWhatsAppUrl,
  unassignedContactLabel,
} from '@/modules/agenda/lib/slotHoldWhatsApp'

describe('slotHoldWhatsApp', () => {
  const hold = {
    customerName: 'Peter la anguila',
    customerPhone: '809-555-1234',
    serviceName: 'Depilación bigote',
    date: '2026-11-24',
    time: '09:00',
  }

  it('construye el mensaje con primer nombre y cita', () => {
    const text = buildSlotHoldWhatsAppMessage(hold)
    expect(text).toContain('Hola Peter,')
    expect(text).toContain('Depilación bigote')
    expect(text).toContain('9:00 AM')
    expect(text).toContain('¿te gustaría')
  })

  it('genera wa.me cuando hay teléfono', () => {
    const url = slotHoldWhatsAppUrl(hold)
    expect(url).toMatch(/^https:\/\/wa\.me\/1\d+\?text=/)
    expect(decodeURIComponent(url)).toContain('Peter')
  })

  it('marca contacto no asignado', () => {
    expect(unassignedContactLabel('')).toBe('No asignado')
    expect(unassignedContactLabel(' 809-123 ')).toBe('809-123')
  })
})