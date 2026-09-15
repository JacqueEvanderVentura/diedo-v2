// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import {
  assignmentPayload,
  toggleModuleSelection,
  workspacePlanPayload,
} from '@/modules/backoffice/backofficeForm'
import BackofficeUsuariosPage from '@/modules/backoffice/pages/BackofficeUsuariosPage'
import CompaniaDetailPage from '@/modules/backoffice/pages/CompaniaDetailPage'
import { backofficeApi } from '@/services/backofficeApi'

vi.mock('@/services/backofficeApi', () => ({
  backofficeApi: {
    listUsers: vi.fn(),
    listWorkspaces: vi.fn(),
    getWorkspace: vi.fn(),
    listPlans: vi.fn(),
    listModules: vi.fn(),
    listWorkspaceMembers: vi.fn(),
    listAudit: vi.fn(),
    updateWorkspace: vi.fn(),
  },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Backoffice form contracts', () => {
  it('añade requisitos y retira dependientes sin quitar módulos base', () => {
    const modules = [
      { code: 'appointments', dependencyCodes: ['crm', 'hr'] },
      { code: 'crm', dependencyCodes: ['foundation'] },
      { code: 'hr', dependencyCodes: ['foundation'] },
    ]
    const selected = toggleModuleSelection(['foundation', 'iam'], 'appointments', modules)
    expect(selected).toEqual(['appointments', 'crm', 'foundation', 'hr', 'iam'])
    expect(toggleModuleSelection(selected, 'hr', modules)).toEqual(['crm', 'foundation', 'iam'])
    expect(toggleModuleSelection(selected, 'foundation', modules)).toEqual(selected)
  })
  it('no reasigna el plan al guardar únicamente módulos y limpia IDs de otros scopes', () => {
    expect(workspacePlanPayload({ version: 3, planCode: 'pro' }, 'pro', ['iam'])).toEqual({
      version: 3,
      enabledModules: ['iam'],
    })
    expect(workspacePlanPayload({ version: 3, planCode: 'pro' }, 'basico', ['iam']).planCode).toBe(
      'basico'
    )
    expect(
      assignmentPayload([
        { roleId: 'r1', scopeType: 'branch', branchId: 'b1', legalEntityId: 'old' },
      ])
    ).toEqual([{ roleId: 'r1', scopeType: 'branch', branchId: 'b1' }])
  })
})

it('conserva compañía y estado en URL y permite acceder a la segunda página', async () => {
  backofficeApi.listWorkspaces.mockResolvedValue({
    items: [{ workspaceId: 'w1', name: 'Company One' }],
  })
  backofficeApi.listUsers.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 25,
    totalItems: 26,
    totalUsers: 26,
    totalPages: 2,
  })
  render(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/backoffice/usuarios?workspaceId=w1&status=disabled'] },
      React.createElement(BackofficeUsuariosPage)
    )
  )
  await waitFor(() =>
    expect(backofficeApi.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', status: 'disabled', page: 1, pageSize: 25 })
    )
  )
  await waitFor(() => expect(screen.getByLabelText('Compañía').value).toBe('w1'))
  expect(screen.getByLabelText('Acceso del usuario').value).toBe('disabled')
  fireEvent.click(await screen.findByText('Siguiente'))
  await waitFor(() =>
    expect(backofficeApi.listUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceId: 'w1', status: 'disabled', page: 2 })
    )
  )
  fireEvent.change(screen.getByLabelText('Cuenta global'), { target: { value: 'disabled' } })
  await waitFor(() =>
    expect(backofficeApi.listUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaceId: 'w1',
        status: 'disabled',
        platformStatus: 'disabled',
        page: 1,
      })
    )
  )
})

it('cambiar plan carga sus módulos antes de guardar y muestra personalización una vez', async () => {
  const company = {
    workspaceId: 'w1',
    name: 'Company One',
    version: 2,
    planCode: 'completo',
    planLabel: 'Completo · personalizado',
    planCustomized: true,
    status: 'active',
    configuredModules: ['foundation', 'iam', 'finance'],
    enabledModules: ['foundation', 'iam', 'finance'],
    branches: [],
  }
  backofficeApi.getWorkspace.mockResolvedValue(company)
  backofficeApi.listPlans.mockResolvedValue({
    items: [
      { planId: 'p1', code: 'basico', name: 'Básico', moduleCodes: ['foundation', 'iam'] },
      { planId: 'p2', code: 'completo', name: 'Completo', moduleCodes: company.configuredModules },
    ],
  })
  backofficeApi.listModules.mockResolvedValue({
    items: [
      { code: 'foundation', name: 'Foundation' },
      { code: 'iam', name: 'IAM' },
      { code: 'finance', name: 'Finanzas' },
    ],
  })
  backofficeApi.listWorkspaceMembers.mockResolvedValue({ items: [], totalItems: 0, totalPages: 0 })
  backofficeApi.listAudit.mockResolvedValue({ items: [], totalItems: 0, totalPages: 0 })
  backofficeApi.updateWorkspace.mockResolvedValue({
    ...company,
    planCode: 'basico',
    configuredModules: ['foundation', 'iam'],
  })
  render(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/backoffice/companias/w1'] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/backoffice/companias/:workspaceId',
          element: React.createElement(CompaniaDetailPage),
        })
      )
    )
  )
  fireEvent.change(await screen.findByLabelText('Plan comercial'), { target: { value: 'basico' } })
  expect(screen.getByRole('button', { name: 'Finanzas' }).getAttribute('aria-pressed')).toBe(
    'false'
  )
  expect(screen.getByText('Plan: Completo · personalizado')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar plan y módulos' }))
  await waitFor(() =>
    expect(backofficeApi.updateWorkspace).toHaveBeenCalledWith('w1', {
      version: 2,
      planCode: 'basico',
      enabledModules: ['foundation', 'iam'],
    })
  )
})
