// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DateCalendar } from '@/components/ui/DateCalendar'
import { monthGrid } from '@/modules/agenda/lib/calendar'

afterEach(cleanup)

const DAY = {
  empty: '2026-11-25',
  open: '2026-11-24',
  limited: '2026-11-26',
  full: '2026-11-27',
  closed: '2026-11-29',
}

const statuses = {
  [DAY.empty]: 'empty',
  [DAY.open]: 'open',
  [DAY.limited]: 'limited',
  [DAY.full]: 'full',
  [DAY.closed]: 'closed',
}

it('marks only empty, limited and full days and shows a legend', () => {
  render(
    <DateCalendar
      value={DAY.empty}
      dayStatuses={statuses}
      minDate="2026-11-01"
      testId="cal"
    />,
  )
  expect(screen.getByTestId(`cal-mark-${DAY.empty}`)).toBeTruthy()
  expect(screen.getByTestId(`cal-mark-${DAY.limited}`)).toBeTruthy()
  expect(screen.getByTestId(`cal-mark-${DAY.full}`)).toBeTruthy()
  expect(screen.queryByTestId(`cal-mark-${DAY.open}`)).toBeNull()
  expect(screen.queryByTestId(`cal-mark-${DAY.closed}`)).toBeNull()
  expect(screen.getByTestId('cal-legend').textContent).toContain('Libre')
  expect(screen.getByTestId(`cal-day-${DAY.limited}`).getAttribute('aria-label')).toMatch(/pocos cupos/)
})

it('does not paint past days or show a legend without visible statuses', () => {
  render(
    <DateCalendar
      value="2026-11-28"
      dayStatuses={{ '2026-11-20': 'empty', '2026-11-21': 'full' }}
      minDate="2026-11-28"
      testId="cal"
    />,
  )
  expect(screen.queryByTestId('cal-mark-2026-11-20')).toBeNull()
  expect(screen.queryByTestId('cal-mark-2026-11-21')).toBeNull()
  expect(screen.queryByTestId('cal-legend')).toBeNull()
})

it('stays unmarked when dayStatuses is omitted', () => {
  render(<DateCalendar value={DAY.empty} minDate="2026-11-01" testId="cal" />)
  expect(screen.queryByTestId(`cal-mark-${DAY.empty}`)).toBeNull()
  expect(screen.queryByTestId('cal-legend')).toBeNull()
})

it('reports the visible month grid range', () => {
  const onVisibleRangeChange = vi.fn()
  render(
    <DateCalendar
      value={DAY.empty}
      onVisibleRangeChange={onVisibleRangeChange}
      testId="cal"
    />,
  )
  const cells = monthGrid(DAY.empty)
  expect(onVisibleRangeChange).toHaveBeenCalledWith({
    from: cells[0].key,
    to: cells[cells.length - 1].key,
  })
})
