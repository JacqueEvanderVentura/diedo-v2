// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { EmployeeScheduleEditor } from '@/modules/rrhh/components/EmployeeScheduleEditor'

let latest = null

function Harness({ initial }) {
  const [value, setValue] = useState(initial)
  latest = value
  return <EmployeeScheduleEditor value={value} onChange={setValue} />
}

describe('EmployeeScheduleEditor', () => {
  afterEach(() => {
    cleanup()
    latest = null
  })

  it('mantiene el bloque y muestra el error si la entrada pasa a ser posterior a la salida', () => {
    render(<Harness initial={{ mon: [{ start: '08:00', end: '10:00' }] }} />)
    const block = screen.getByTestId('schedule-block-mon-0')

    fireEvent.change(within(block).getByLabelText('Hora de entrada'), { target: { value: '11:00' } })

    const updated = screen.getByTestId('schedule-block-mon-0')
    expect(within(updated).getByLabelText('Hora de entrada').value).toBe('11:00')
    expect(within(updated).getByLabelText('Hora de salida').value).toBe('10:00')
    expect(updated.textContent).toMatch(/posterior a la salida/)
    expect(latest.mon).toEqual([{ start: '11:00', end: '10:00' }])
    expect(screen.getByTestId('schedule-day-mon').getAttribute('aria-label')).toMatch(/con errores/)

    fireEvent.change(within(updated).getByLabelText('Hora de salida'), { target: { value: '13:00' } })
    expect(screen.getByTestId('schedule-block-mon-0').textContent).not.toMatch(/posterior/)
  })

  it('no reordena los bloques mientras se editan', () => {
    render(<Harness initial={{
      mon: [
        { start: '08:00', end: '10:00' },
        { start: '14:00', end: '16:00' },
      ],
    }} />)

    const first = screen.getByTestId('schedule-block-mon-0')
    fireEvent.change(within(first).getByLabelText('Hora de entrada'), { target: { value: '15:00' } })

    expect(latest.mon[0].start).toBe('15:00')
    expect(latest.mon[1].start).toBe('14:00')
  })

  it('agrega un bloque válido después de un bloque que termina tarde', () => {
    render(<Harness initial={{ mon: [{ start: '20:00', end: '22:00' }] }} />)

    fireEvent.click(screen.getByTestId('schedule-add-block'))

    expect(latest.mon).toEqual([
      { start: '20:00', end: '22:00' },
      { start: '22:00', end: '23:59' },
    ])
    expect(screen.getByTestId('schedule-block-mon-1').textContent).not.toMatch(/posterior|misma hora/)
  })

  it('desactiva agregar bloque cuando no queda espacio en el día', () => {
    render(<Harness initial={{ mon: [{ start: '20:00', end: '23:45' }] }} />)
    expect(screen.getByTestId('schedule-add-block').disabled).toBe(true)
  })
})
