import { describe, expect, it } from 'vitest'
import { activityDueUrgencyClass, activityDueUrgencyTone } from '@/modules/crm/lib/countdown'

describe('activityDueUrgencyTone', () => {
  const now = new Date('2026-10-05T10:00:00Z')

  it('marca rojo con menos de 10 horas', () => {
    const dueAt = new Date('2026-10-05T18:00:00Z').toISOString()
    expect(activityDueUrgencyTone(dueAt, now)).toBe('critical')
    expect(activityDueUrgencyClass('critical')).toContain('red')
  })

  it('marca amarillo entre 10 y 48 horas', () => {
    const dueAt = new Date('2026-10-06T20:00:00Z').toISOString()
    expect(activityDueUrgencyTone(dueAt, now)).toBe('warning')
    expect(activityDueUrgencyClass('warning')).toContain('amber')
  })

  it('marca rojo si ya venció', () => {
    const dueAt = new Date('2026-10-05T08:00:00Z').toISOString()
    expect(activityDueUrgencyTone(dueAt, now)).toBe('overdue')
  })

  it('queda normal con más de 48 horas', () => {
    const dueAt = new Date('2026-10-10T10:00:00Z').toISOString()
    expect(activityDueUrgencyTone(dueAt, now)).toBe('normal')
  })
})
