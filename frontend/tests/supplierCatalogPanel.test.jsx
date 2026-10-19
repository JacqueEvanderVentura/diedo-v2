/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  fetchSupplierCatalog: vi.fn(() => Promise.resolve([])),
  saveSupplierCatalogItem: vi.fn(),
  setCategories: vi.fn(),
  addCategory: vi.fn(),
  isOnline: () => true,
  hasPermission: () => true,
}))

vi.mock('@/stores/comprasStore', () => ({
  useComprasStore: (selector) =>
    selector({
      fetchSupplierCatalog: mocks.fetchSupplierCatalog,
      saveSupplierCatalogItem: mocks.saveSupplierCatalogItem,
    }),
}))

vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) =>
    selector({
      categories: [{ id: 'cat-1', name: 'Químicos', type: 'insumo', active: true }],
      setCategories: mocks.setCategories,
      addCategory: mocks.addCategory,
    }),
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector) =>
    selector({
      isOnline: mocks.isOnline,
      hasPermission: mocks.hasPermission,
    }),
}))

import { SupplierCatalogPanel } from '@/modules/compras/components/SupplierCatalogPanel'
import { COMMON_MEASURE_UNITS } from '@/modules/compras/lib/measureUnits'

describe('SupplierCatalogPanel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('pone crear nuevo dentro del dropdown de categoría y unidad', () => {
    render(<SupplierCatalogPanel supplierId="11111111-1111-1111-1111-111111111111" />)

    fireEvent.click(screen.getByTestId('supplier-catalog-category'))
    expect(screen.getByTestId('supplier-catalog-category-create').textContent).toMatch(/Crear categoría/)
    expect(screen.getByTestId('supplier-catalog-category-option-Químicos')).toBeTruthy()
    fireEvent.click(screen.getByTestId('supplier-catalog-category-create'))
    expect(screen.getByTestId('supplier-catalog-category-modal')).toBeTruthy()
    fireEvent.click(screen.getByTestId('modal-close'))

    fireEvent.click(screen.getByTestId('supplier-catalog-unit'))
    expect(screen.getByTestId('supplier-catalog-unit-create').textContent).toMatch(/Crear unidad/)
    COMMON_MEASURE_UNITS.forEach((unit) => {
      expect(screen.getByTestId(`supplier-catalog-unit-option-${unit}`)).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('supplier-catalog-unit-create'))
    expect(screen.getByTestId('supplier-catalog-unit-modal')).toBeTruthy()
  })
})
