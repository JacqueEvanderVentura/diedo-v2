// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@/components/ui/WhatsAppMenuButton', () => ({
  WhatsAppMenuButton: () => <button type="button" aria-label="Enviar WhatsApp" />,
}))

import { WeekView } from '@/modules/agenda/components/calendar/WeekView'
import { MonthView } from '@/modules/agenda/components/calendar/MonthView'

afterEach(cleanup)

it('opens scheduling from an empty week day cell without triggering appointment edit', () => {
  const onScheduleDay = vi.fn()
  const onAppointmentClick = vi.fn()
  render(
    <WeekView
      cursor="2026-10-05"
      appointments={[{
        id: 'apt-1',
        date: '2026-10-10',
        time: '10:00',
        customerName: 'Cliente',
        serviceName: 'Servicio',
        status: 'confirmada',
      }]}
      onScheduleDay={onScheduleDay}
      onAppointmentClick={onAppointmentClick}
    />,
  )

  fireEvent.click(screen.getByTestId('calendar-week-day-2026-10-08'))
  expect(onScheduleDay).toHaveBeenCalledWith('2026-10-08')
  expect(onAppointmentClick).not.toHaveBeenCalled()

  fireEvent.click(screen.getByText('Cliente'))
  expect(onAppointmentClick).toHaveBeenCalled()
  expect(onScheduleDay).toHaveBeenCalledTimes(1)
})

it('opens scheduling from a month day cell', () => {
  const onScheduleDay = vi.fn()
  render(
    <MonthView
      cursor="2026-10-05"
      appointments={[]}
      onScheduleDay={onScheduleDay}
      onAppointmentClick={() => {}}
    />,
  )

  fireEvent.click(screen.getByTestId('calendar-month-day-2026-10-08'))
  expect(onScheduleDay).toHaveBeenCalledWith('2026-10-08')
})
