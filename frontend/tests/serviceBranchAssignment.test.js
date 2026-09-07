// @vitest-environment jsdom

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  saveProduct: vi.fn(),
  recordAdjustment: vi.fn(),
  branches: [
    {
      id: 'branch-main',
      name: 'Sucursal Centro',
      legalEntityId: 'entity-charm',
      legalName: 'Charm Esthetic Clinic SRL',
    },
    {
      id: 'branch-east',
      name: 'Sucursal Este',
      legalEntityId: 'entity-east',
      legalName: 'Charm Este SRL',
    },
  ],
  category: {
    id: 'category-laser',
    name: 'Láser',
    api: true,
  },
}))

vi.mock('@/stores/catalogStore', () => ({
  useCatalogStore: (selector) => selector({ saveProduct: mocks.saveProduct }),
}))
vi.mock('@/stores/inventarioStore', () => ({
  useInventarioStore: (selector) => selector({ recordAdjustment: mocks.recordAdjustment }),
}))
vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) => selector({
    categories: [mocks.category],
    branches: mocks.branches,
    settings: { taxDefault: 18 },
  }),
}))
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector) => selector({ isOnline: () => true }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ open, children }) => open ? children : null,
}))

import { ProductFormModal } from '@/modules/inventarios/components/ProductFormModal'

const service = {
  id: 'service-laser',
  name: 'Sesión láser',
  sku: 'LASER-1',
  type: 'service',
  category: mocks.category.id,
  categoryId: mocks.category.id,
  branchId: mocks.branches[0].id,
  branchIds: [mocks.branches[0].id],
  unit: 'ud',
  price: 900,
  taxPct: 18,
  stock: null,
  status: 'active',
  version: 1,
  apiSynced: true,
}

describe('asignación de servicios por empresa y sucursal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveProduct.mockResolvedValue(service.id)
  })

  afterEach(() => cleanup())

  it('permite seleccionar sucursales de empresas legales diferentes', async () => {
    render(React.createElement(ProductFormModal, {
      open: true,
      onClose: vi.fn(),
      product: service,
    }))

    expect(screen.getByText('Charm Esthetic Clinic SRL')).toBeTruthy()
    expect(screen.getByText('Charm Este SRL')).toBeTruthy()
    fireEvent.click(screen.getByTestId('inventory-branch-branch-east'))
    fireEvent.click(screen.getByTestId('inventory-form-save'))

    await waitFor(() => expect(mocks.saveProduct).toHaveBeenCalledTimes(1))
    expect(mocks.saveProduct.mock.calls[0][0]).toMatchObject({
      branchId: 'branch-main',
      branchIds: ['branch-main', 'branch-east'],
    })
  })

  it('exige que el servicio conserve al menos una sucursal', () => {
    render(React.createElement(ProductFormModal, {
      open: true,
      onClose: vi.fn(),
      product: service,
    }))

    fireEvent.click(screen.getByTestId('inventory-branch-branch-main'))
    fireEvent.click(screen.getByTestId('inventory-form-save'))

    expect(screen.getByTestId('inventory-form-error').textContent).toContain('al menos una sucursal')
    expect(mocks.saveProduct).not.toHaveBeenCalled()
  })
})
