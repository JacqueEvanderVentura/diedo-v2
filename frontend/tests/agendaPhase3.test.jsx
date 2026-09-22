// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/components/ui/WhatsAppMenuButton', () => ({
  WhatsAppMenuButton: () => <button type="button" aria-label="Enviar WhatsApp" />,
}))

import { AppointmentChip } from '@/modules/agenda/components/calendar/AppointmentChip'
import { DayView } from '@/modules/agenda/components/calendar/DayView'
import { appointmentCardNote } from '@/modules/agenda/lib/appointments'

const appointment = {
  id: 'appointment-phase-3',
  branchId: 'branch-1',
  cabinaId: 'resource-1',
  customerName: 'Cliente Agenda',
  customerPhone: '8294220141',
  serviceName: 'Sesión de terapia',
  date: '2026-09-22',
  time: '08:00',
  duration: 30,
  status: 'confirmada',
  notes: 'Confirmar alergia',
}

afterEach(cleanup)

describe('fase 3 de Agenda', () => {
  it('limita la nota visible a 15 caracteres incluyendo la elipsis', () => {
    expect(appointmentCardNote('123456789012345')).toBe('123456789012345')
    expect(appointmentCardNote('1234567890123456')).toBe('12345678901234…')
  })

  it('muestra en la tarjeta de Día la nota corta en lugar de la hora', () => {
    render(<AppointmentChip apt={appointment} compact showDayNote />)

    expect(screen.getByText('Confirmar aler…')).toBeTruthy()
    expect(screen.queryByText('08:00')).toBeNull()
    expect(screen.getByText('Confirmar aler…').getAttribute('title')).toBe('Confirmar alergia')
  })

  it('muestra Sin nota en una tarjeta de Día sin notas', () => {
    render(<AppointmentChip apt={{ ...appointment, notes: '' }} compact showDayNote />)

    expect(screen.getByText('Sin nota')).toBeTruthy()
    expect(screen.queryByText('08:00')).toBeNull()
  })

  it('conserva la hora en tarjetas de Semana y Mes', () => {
    render(<AppointmentChip apt={appointment} compact />)

    expect(screen.getByText('08:00')).toBeTruthy()
    expect(screen.queryByText('Confirmar aler…')).toBeNull()
  })

  it('mantiene fija la cabecera y las celdas de la columna Hora', () => {
    render(
      <DayView
        dateKey="2026-09-22"
        appointments={[]}
        resources={[{ id: 'resource-1', name: 'Cabina 1', access: 'use' }]}
        startHour={8}
        endHour={9}
      />
    )

    expect(screen.getByTestId('calendar-time-heading').className).toContain('sticky')
    expect(screen.getByTestId('calendar-time-08:00').className).toContain('sticky')
  })
})
