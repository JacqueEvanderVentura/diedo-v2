// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CalendarStatsBar } from '@/modules/agenda/components/calendar/CalendarStatsBar'

const stats = {
  monthCount: 12,
  rangeCount: 5,
  rangeDays: 7,
  averagePerDay: 0.7,
  dayCount: 3,
  weekCount: 5,
}

afterEach(cleanup)

it('shows month and week stats in week view', () => {
  render(<CalendarStatsBar stats={stats} view="week" />)
  expect(screen.getByTestId('calendar-stat-month')).toBeTruthy()
  expect(screen.getByTestId('calendar-stat-week')).toBeTruthy()
  expect(screen.getByTestId('calendar-stat-average')).toBeTruthy()
  expect(screen.queryByTestId('calendar-stat-day')).toBeNull()
})

it('shows day stat in day view without average', () => {
  render(<CalendarStatsBar stats={stats} view="day" />)
  expect(screen.getByTestId('calendar-stat-month')).toBeTruthy()
  expect(screen.getByTestId('calendar-stat-day')).toBeTruthy()
  expect(screen.queryByTestId('calendar-stat-average')).toBeNull()
  expect(screen.queryByTestId('calendar-stat-week')).toBeNull()
})
