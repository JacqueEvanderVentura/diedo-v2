import { describe, expect, it } from 'vitest'
import {
  buildCompletionPayload,
  formatCompletionSummary,
  normalizeAppointmentStatus,
} from '@/modules/agenda/lib/completion'

describe('appointment completion', () => {
  it('normalizes legacy statuses to the four canonical values', () => {
    expect(normalizeAppointmentStatus('completada')).toBe('cumplida')
    expect(normalizeAppointmentStatus('asistio')).toBe('cumplida')
    expect(normalizeAppointmentStatus('pendiente')).toBe('confirmada')
    expect(normalizeAppointmentStatus('confirmada')).toBe('confirmada')
  })

  it('builds on-time and delayed completion payloads', () => {
    expect(buildCompletionPayload({ punctuality: 'on_time' })).toMatchObject({
      status: 'cumplida',
      completionPunctuality: 'on_time',
      delayResponsibility: null,
    })
    expect(buildCompletionPayload({
      punctuality: 'delayed',
      delayResponsibility: 'customer',
      completionNote: 'Llegó tarde',
    })).toMatchObject({
      completionPunctuality: 'delayed',
      delayResponsibility: 'customer',
      completionNote: 'Llegó tarde',
    })
  })

  it('formats completion summaries for UI', () => {
    expect(formatCompletionSummary({
      status: 'cumplida',
      completedAt: '2026-09-08T15:42:00.000Z',
      completionPunctuality: 'on_time',
    })).toMatch(/Cumplida a las/)
    expect(formatCompletionSummary({
      status: 'cumplida',
      completionPunctuality: 'delayed',
      delayResponsibility: 'customer',
    })).toBe('Cumplida en retraso · Cliente')
  })
})
