// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveCalendarDrop,
  resolveCalendarDropForCard,
} from '@/modules/agenda/hooks/useCalendarResourceDrag'

function slotCell(resourceId, slot) {
  const cell = document.createElement('div')
  cell.dataset.calendarResource = resourceId
  if (slot) cell.dataset.calendarSlot = slot
  return cell
}

function mockElementsByY(byY) {
  document.elementsFromPoint = vi.fn((_x, y) => byY(y))
}

describe('calendar resource drag drop resolution', () => {
  afterEach(() => {
    delete document.elementsFromPoint
  })

  it('prefers the slot cell under the point over the chip start cell', () => {
    const startCell = slotCell('cab2', '10:00')
    const chip = document.createElement('div')
    startCell.appendChild(chip)
    const coveredCell = slotCell('cab2', '10:30')
    mockElementsByY(() => [chip, coveredCell])

    expect(resolveCalendarDrop(10, 10)).toEqual({ resourceId: 'cab2', slot: '10:30' })
  })

  it('uses the card top edge instead of the pointer when grabbed low', () => {
    const top = slotCell('cab1', '10:00')
    const pointer = slotCell('cab1', '10:30')
    mockElementsByY((y) => (y < 100 ? [top] : [pointer]))

    expect(resolveCalendarDropForCard(10, 140, 60)).toEqual({ resourceId: 'cab1', slot: '10:00' })
  })

  it('falls back to the pointer when the card top lands outside a slot', () => {
    const header = slotCell('cab1', null)
    const pointer = slotCell('cab1', '08:00')
    mockElementsByY((y) => (y < 100 ? [header] : [pointer]))

    expect(resolveCalendarDropForCard(10, 110, 60)).toEqual({ resourceId: 'cab1', slot: '08:00' })
  })

  it('returns null outside the calendar grid', () => {
    mockElementsByY(() => [document.createElement('div')])

    expect(resolveCalendarDropForCard(10, 110, 60)).toBeNull()
  })
})
