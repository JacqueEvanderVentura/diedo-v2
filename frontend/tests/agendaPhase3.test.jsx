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
  it('limita la nota visible a 40 caracteres incluyendo la elipsis', () => {
    const exact = '1234567890'.repeat(4)
    expect(appointmentCardNote(exact)).toBe(exact)
    expect(appointmentCardNote(`${exact}1`)).toBe(`${exact.slice(0, 39)}…`)
    expect(appointmentCardNote('   ')).toBe('')
  })

  it('muestra en la tarjeta de Día la nota en lugar de la hora', () => {
    render(<AppointmentChip apt={appointment} compact showDayNote />)

    const note = screen.getByText('Confirmar alergia')
    expect(note.getAttribute('title')).toBe('Confirmar alergia')
    expect(note.className).toContain('line-clamp-2')
    expect(screen.queryByText('08:00')).toBeNull()
  })

  it('no muestra nota ni hora en una tarjeta de Día sin notas', () => {
    render(<AppointmentChip apt={{ ...appointment, notes: '' }} compact showDayNote />)

    expect(screen.queryByText('Sin nota')).toBeNull()
    expect(screen.queryByText('08:00')).toBeNull()
    expect(screen.queryByLabelText(/^Nota:/)).toBeNull()
  })

  it('conserva la hora en tarjetas de Semana y Mes', () => {
    render(<AppointmentChip apt={appointment} compact />)

    expect(screen.getByText('08:00')).toBeTruthy()
    expect(screen.queryByText('Confirmar alergia')).toBeNull()
  })

  it('marca Sin especialista en amarillo cuando la cita no tiene empleado', () => {
    render(<AppointmentChip apt={appointment} compact showDayNote />)

    const badge = screen.getByTestId(`calendar-apt-unassigned-${appointment.id}`)
    expect(badge.textContent).toBe('Sin especialista')
    expect(badge.className).toContain('bg-amber-100')
    expect(screen.queryByTestId(`calendar-apt-specialist-${appointment.id}`)).toBeNull()
  })

  it('marca el especialista en azul oscuro con su nombre', () => {
    render(
      <AppointmentChip
        apt={{ ...appointment, employeeId: 'emp-1', employeeName: 'Laura Pérez' }}
        compact
        showDayNote
      />,
    )

    const badge = screen.getByTestId(`calendar-apt-specialist-${appointment.id}`)
    expect(badge.textContent).toBe('Laura Pérez')
    expect(badge.className).toContain('bg-blue-200')
    expect(screen.queryByTestId(`calendar-apt-unassigned-${appointment.id}`)).toBeNull()
  })

  it('usa un texto genérico si no conoce el nombre del especialista', () => {
    render(<AppointmentChip apt={{ ...appointment, employeeId: 'emp-desconocido' }} compact showDayNote />)

    expect(screen.getByTestId(`calendar-apt-specialist-${appointment.id}`).textContent).toBe('Con especialista')
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
