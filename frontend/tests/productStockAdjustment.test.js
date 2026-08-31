// @vitest-environment jsdom

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  saveProduct: vi.fn(),
  recordAdjustment: vi.fn(),
  toastSuccess: vi.fn(),
  branch: {
    id: '01a03144-dff3-70d8-aedc-70a77395c0a2',
    name: 'Sucursal Centro',
    active: true,
  },
  category: {
    id: '3441160d-de87-57db-b32d-544f4d853d55',
    name: 'Insumos',
    api: true,
  },
}))

const branch = mocks.branch
const category = mocks.category

vi.mock('@/stores/catalogStore', () => ({
  useCatalogStore: (selector) => selector({ saveProduct: mocks.saveProduct }),
}))
vi.mock('@/stores/inventarioStore', () => ({
  useInventarioStore: (selector) => selector({ recordAdjustment: mocks.recordAdjustment }),
}))
vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) => selector({
    categories: [mocks.category],
    branches: [mocks.branch],
    settings: { taxDefault: 18 },
  }),
}))
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector) => selector({ isOnline: () => true }),
}))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }))
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ open, children }) => open ? children : null,
}))

import { ProductFormModal } from '@/modules/inventarios/components/ProductFormModal'

const product = {
  id: '01a0582b-513c-72e0-bf4d-c86ce00720f1',
  name: 'Guantes',
  sku: 'GS',
  type: 'supply',
  category: category.id,
  categoryId: category.id,
  branchId: branch.id,
  branchIds: [branch.id],
  unit: 'ud',
  price: 0,
  cost: 100,
  taxPct: 0,
  stock: 10,
  minStock: 5,
  status: 'active',
  version: 2,
  apiSynced: true,
}

describe('corrección de stock desde el formulario de inventario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordAdjustment.mockResolvedValue({ id: 'adjustment-id' })
    mocks.saveProduct.mockResolvedValue(product.id)
  })

  afterEach(() => cleanup())

  it('exige un motivo y registra el ajuste antes de actualizar los demás datos', async () => {
    render(React.createElement(ProductFormModal, {
      open: true,
      onClose: vi.fn(),
      product,
    }))

    fireEvent.change(screen.getByTestId('inventory-field-stock'), { target: { value: '7' } })
    expect(screen.getByTestId('inventory-stock-adjustment').textContent).toContain('10')
    expect(screen.getByTestId('inventory-stock-adjustment').textContent).toContain('7')

    fireEvent.click(screen.getByTestId('inventory-form-save'))
    expect(screen.getByTestId('inventory-form-error').textContent).toContain('motivo')
    expect(mocks.recordAdjustment).not.toHaveBeenCalled()
    expect(mocks.saveProduct).not.toHaveBeenCalled()

    fireEvent.change(screen.getByTestId('inventory-stock-adjustment-reason'), {
      target: { value: 'Corrección por conteo físico' },
    })
    fireEvent.click(screen.getByTestId('inventory-form-save'))

    await waitFor(() => expect(mocks.saveProduct).toHaveBeenCalledTimes(1))
    expect(mocks.recordAdjustment).toHaveBeenCalledWith({
      branchId: branch.id,
      comment: 'Corrección por conteo físico',
      items: [{
        id: product.id,
        name: product.name,
        sku: product.sku,
        unit: 'ud',
        stock: 10,
        quantity: 7,
      }],
    }, { isOnline: true })
    expect(mocks.recordAdjustment.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveProduct.mock.invocationCallOrder[0]
    )
  })

  it('no crea un movimiento cuando la existencia no cambió', async () => {
    render(React.createElement(ProductFormModal, {
      open: true,
      onClose: vi.fn(),
      product,
    }))

    fireEvent.click(screen.getByTestId('inventory-form-save'))

    await waitFor(() => expect(mocks.saveProduct).toHaveBeenCalledTimes(1))
    expect(mocks.recordAdjustment).not.toHaveBeenCalled()
  })
})
