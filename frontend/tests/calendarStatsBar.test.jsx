// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CalendarStatsBar } from '@/modules/agenda/components/calendar/CalendarStatsBar'

const stats = {
  rangeScopeLabel: 'de la semana visible',
  total: 12,
  pending: 5,
  completed: 4,
  noShow: 1,
  cancelled: 2,
}

afterEach(cleanup)

it('shows operational status cards for the visible range', () => {
  render(<CalendarStatsBar stats={stats} />)
  expect(screen.getByTestId('calendar-stat-total')).toBeTruthy()
  expect(screen.getByTestId('calendar-stat-pending')).toBeTruthy()
  expect(screen.getByTestId('calendar-stat-completed')).toBeTruthy()
  expect(screen.getByTestId('calendar-stat-noshow')).toBeTruthy()
  expect(screen.getByTestId('calendar-stat-cancelled')).toBeTruthy()
  expect(screen.getByTestId('calendar-stat-cancelled-value').textContent).toBe('2')
})
