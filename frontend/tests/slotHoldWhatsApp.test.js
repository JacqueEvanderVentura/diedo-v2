import { describe, expect, it } from 'vitest'
import {
  buildResumeBookingWhatsAppMessage,
  buildSlotHoldWhatsAppMessage,
  canSendResumeBookingWhatsApp,
  resumeBookingWhatsAppUrl,
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

  describe('continuar agenda abandonada', () => {
    const resumeUrl = 'https://app.example.com/agendar?branch=b1&service=s1&date=2026-11-24&time=09%3A00'
    const base = {
      customerName: 'Peter la anguila',
      serviceName: 'Depilación bigote',
      resumeUrl,
    }

    it('incluye fecha y hora cuando siguen disponibles', () => {
      const text = buildResumeBookingWhatsAppMessage({ ...base, date: '2026-11-24', time: '09:00' })
      expect(text).toContain('Hola Peter,')
      expect(text).toContain('Depilación bigote para el ')
      expect(text).toContain('24 de noviembre de 2026')
      expect(text).toContain('a las 9:00 AM')
      expect(text).toContain('¿te gustaría que te la agendemos?')
      expect(text).toContain(resumeUrl)
    })

    it('omite la hora cuando ya no está disponible', () => {
      const text = buildResumeBookingWhatsAppMessage({ ...base, date: '2026-11-24', time: null })
      expect(text).toContain('24 de noviembre de 2026')
      expect(text).not.toContain('a las')
      expect(text).toContain(resumeUrl)
    })

    it('omite fecha y hora cuando el día ya pasó o no hay disponibilidad', () => {
      const text = buildResumeBookingWhatsAppMessage({ ...base, date: null, time: null })
      expect(text).toContain('una cita de Depilación bigote, ¿te gustaría')
      expect(text).not.toContain(' para el ')
      expect(text).not.toContain('a las')
      expect(text).toContain(resumeUrl)
    })

    it('usa valores de respaldo sin nombre ni servicio', () => {
      const text = buildResumeBookingWhatsAppMessage({
        customerName: '',
        serviceName: '  ',
        resumeUrl,
      })
      expect(text).toContain('Hola cliente,')
      expect(text).toContain('una cita de servicio,')
    })

    it('genera wa.me solo con teléfono válido', () => {
      const url = resumeBookingWhatsAppUrl({
        ...base,
        customerPhone: '809-555-1234',
        date: null,
        time: null,
      })
      expect(url).toMatch(/^https:\/\/wa\.me\/1\d+\?text=/)
      expect(decodeURIComponent(url)).toContain(resumeUrl)
      expect(resumeBookingWhatsAppUrl({ ...base, customerPhone: '', resumeUrl })).toBeNull()
    })

    it('ofrece el botón solo en agendas sin finalizar con teléfono', () => {
      const snapshot = { customerPhone: '809-555-1234', scheduledDate: '2026-11-24' }
      expect(
        canSendResumeBookingWhatsApp({
          eventType: 'slot_hold.abandoned',
          link: { path: '/agenda', slotHoldResume: snapshot },
        }),
      ).toBe(true)
      expect(
        canSendResumeBookingWhatsApp({
          eventType: 'slot_hold.abandoned',
          link: { path: '/agenda', slotHoldResume: { ...snapshot, customerPhone: ' ' } },
        }),
      ).toBe(false)
      expect(
        canSendResumeBookingWhatsApp({ eventType: 'slot_hold.abandoned', link: { path: '/agenda' } }),
      ).toBe(false)
      expect(
        canSendResumeBookingWhatsApp({
          eventType: 'appointment.booked',
          link: { path: '/agenda', slotHoldResume: snapshot },
        }),
      ).toBe(false)
    })
  })
})