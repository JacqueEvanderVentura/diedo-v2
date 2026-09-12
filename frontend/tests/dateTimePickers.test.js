import { describe, expect, it } from 'vitest'
import { monthGrid, timeSlots } from '@/modules/agenda/lib/calendar'
import { todayKey } from '@/stores/agendaStore'

describe('appointment date/time pickers', () => {
  it('monthGrid returns 42 cells for a month view', () => {
    const cells = monthGrid(todayKey())
    expect(cells).toHaveLength(42)
    expect(cells.some((cell) => cell.inMonth)).toBe(true)
  })

  it('timeSlots generates 30-minute intervals from 8 to 20', () => {
    const slots = timeSlots(8, 20, 30)
    expect(slots[0]).toBe('08:00')
    expect(slots).toContain('12:00')
    expect(slots.at(-1)).toBe('19:30')
  })
})
