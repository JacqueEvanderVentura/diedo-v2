// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EmployeeFormModal } from '@/modules/rrhh/components/EmployeeFormModal'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'

vi.mock('@/services/masterDataApi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    masterDataApi: {
      ...actual.masterDataApi,
      employeeAttachments: vi.fn().mockResolvedValue([]),
    },
  }
})

vi.mock('@/modules/rrhh/components/EmployeeScheduleEditor', () => ({
  EmployeeScheduleEditor: () => <div data-testid="schedule-editor-stub" />,
}))

function renderForm(permissions) {
  useSessionStore.setState({
    status: 'online',
    user: { effectivePermissionCodes: permissions, branchIds: ['branch-1'] },
  })
  useConfigStore.setState({
    branches: [{ id: 'branch-1', name: 'Principal', active: true }],
    users: [],
  })
  return render(
    <EmployeeFormModal
      open
      onClose={() => {}}
      employee={null}
      employees={[]}
      onSubmit={vi.fn()}
    />
  )
}

describe('EmployeeFormModal campos de directorio', () => {
  beforeEach(() => {
    useSessionStore.setState({
      status: 'online',
      user: { effectivePermissionCodes: [] },
    })
  })

  afterEach(cleanup)

  it('formatea la cédula al escribir', () => {
    renderForm(['employee.manage'])
    const input = screen.getByLabelText('Cédula')
    fireEvent.change(input, { target: { value: '00112345678' } })
    expect(input.value).toBe('001-1234567-8')
  })

  it('oculta salario, residencia y contrato sin hr.profile.read', () => {
    renderForm(['employee.manage'])
    expect(screen.getByLabelText('Cédula')).toBeTruthy()
    expect(screen.queryByLabelText('Salario mensual')).toBeNull()
    expect(screen.queryByLabelText('Ubicación de residencia')).toBeNull()
    expect(screen.queryByTestId('employee-contract-attachment')).toBeNull()
  })

  it('muestra salario y contrato con hr.profile.manage', () => {
    renderForm(['employee.manage', 'hr.profile.read', 'hr.profile.manage'])
    expect(screen.getByLabelText('Salario mensual')).toBeTruthy()
    expect(screen.getByLabelText('Ubicación de residencia')).toBeTruthy()
    expect(screen.getByTestId('employee-contract-attachment')).toBeTruthy()
    expect(screen.getByTestId('employee-documents-attachment')).toBeTruthy()
  })

  it('oculta documentos sin hr.profile.read', () => {
    renderForm(['employee.manage'])
    expect(screen.queryByTestId('employee-documents-attachment')).toBeNull()
  })

  it('anuncia el error de validación con role alert', () => {
    renderForm(['employee.manage'])
    fireEvent.click(screen.getByRole('button', { name: 'Crear empleado' }))
    expect(screen.getByRole('alert').textContent).toMatch(/nombre/i)
  })

  it('bloquea el guardado si un bloque de horario tiene la entrada después de la salida', () => {
    useSessionStore.setState({
      status: 'online',
      user: { effectivePermissionCodes: ['employee.manage'], branchIds: ['branch-1'] },
    })
    useConfigStore.setState({
      branches: [{ id: 'branch-1', name: 'Principal', active: true }],
      users: [],
    })
    const onSubmit = vi.fn()
    render(
      <EmployeeFormModal
        open
        onClose={() => {}}
        employee={{
          id: 'emp-1',
          firstName: 'Ana',
          lastName: 'Pérez',
          position: 'Especialista',
          branchIds: ['branch-1'],
          workSchedule: { mon: [{ start: '10:00', end: '09:00' }] },
        }}
        employees={[]}
        onSubmit={onSubmit}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Lunes: La entrada no puede ser posterior/)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
