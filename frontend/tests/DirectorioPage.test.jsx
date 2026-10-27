// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DirectorioPage from '@/modules/rrhh/pages/DirectorioPage'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'

vi.mock('@/services/usersApi', () => ({
  usersApi: { list: vi.fn().mockResolvedValue({ items: [] }) },
}))

const employee = {
  id: 'emp-card',
  firstName: 'Camila',
  lastName: 'Núñez',
  position: 'Especialista Laser',
  department: 'Laser',
  hireDate: '2026-03-01',
  email: 'camila@example.com',
  phone: '8095550000',
  salary: 85000,
  documentId: '001-1234567-8',
  residenceLocation: 'Santo Domingo, DN',
  branchIds: ['branch-1'],
  jefeIds: [],
  active: true,
  workSchedule: {},
}

describe('Directorio de RRHH', () => {
  beforeEach(() => {
    useSessionStore.setState({
      status: 'online',
      user: { effectivePermissionCodes: ['employee.read', 'hr.profile.read'] },
    })
    useConfigStore.setState({
      branches: [{ id: 'branch-1', name: 'Principal', active: true }],
    })
    useRrhhStore.setState({
      employees: [employee],
      employeesDataState: { status: 'ready' },
      hydrateEmployees: vi.fn(),
      addEmployee: vi.fn(),
      updateEmployee: vi.fn(),
      deleteEmployee: vi.fn(),
    })
  })

  afterEach(cleanup)

  it('no muestra cédula, salario, residencia ni contrato en las cards', () => {
    render(
      <MemoryRouter>
        <DirectorioPage />
      </MemoryRouter>
    )

    const card = screen.getByTestId('employee-card-emp-card')
    expect(card.textContent).toContain('Camila Núñez')
    expect(card.textContent).toContain('Especialista Laser')
    expect(card.textContent).not.toContain('001-1234567-8')
    expect(card.textContent).not.toContain('85000')
    expect(card.textContent).not.toContain('Santo Domingo')
    expect(card.textContent).not.toMatch(/contrato/i)
    expect(screen.getByLabelText('Editar Camila Núñez')).toBeTruthy()
  })
})
