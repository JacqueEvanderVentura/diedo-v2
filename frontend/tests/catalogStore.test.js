import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listCategories: vi.fn(),
  listUnitsOfMeasure: vi.fn(),
  listAllItems: vi.fn(),
  createProduct: vi.fn(),
  createSupply: vi.fn(),
  createService: vi.fn(),
  updateItem: vi.fn(),
  branches: vi.fn(),
}))

vi.mock('@/services/catalogApi', () => ({
  catalogApi: {
    listCategories: mocks.listCategories,
    listUnitsOfMeasure: mocks.listUnitsOfMeasure,
  },
}))
vi.mock('@/services/inventoryApi', () => ({
  inventoryApi: {
    listAllItems: mocks.listAllItems,
    createProduct: mocks.createProduct,
    createSupply: mocks.createSupply,
    createService: mocks.createService,
    updateItem: mocks.updateItem,
  },
}))
vi.mock('@/services/lookupsApi', () => ({ lookupsApi: { branches: mocks.branches } }))

import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'

const category = {
  id: '77f9c771-9b2a-40af-ae14-311bc4c703ea',
  name: 'Otros',
  description: '',
  status: 'active',
  version: 1,
}
const branch = {
  id: '01a03129-a18a-724f-ba73-96eedf0b84d7',
  name: 'Secondary',
  code: 'SEC',
}
const unit = {
  id: '966962b2-3b91-4dcc-b188-e62e21e66ad4',
  code: 'unit',
  name: 'Unidad',
  symbol: 'ud',
}

describe('store de catálogo conectado al inventario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCatalogStore.setState({
      products: [],
      apiContext: { units: [], apiBranches: [], hydrated: false },
    })
    useConfigStore.setState({ categories: [] })
  })

  it('hidrata las categorías antes de habilitar el formulario de inventario', async () => {
    mocks.listCategories.mockResolvedValue({ items: [category] })
    mocks.listAllItems.mockResolvedValue({ items: [] })
    mocks.listUnitsOfMeasure.mockResolvedValue([unit])
    mocks.branches.mockResolvedValue([branch])

    await useCatalogStore.getState().hydrateFromApi([branch])

    expect(mocks.listAllItems).toHaveBeenCalledWith({ status: 'active' })
    expect(useConfigStore.getState().categories).toEqual([
      expect.objectContaining({ id: category.id, name: 'Otros', api: true }),
    ])
    expect(useCatalogStore.getState().apiContext).toMatchObject({ hydrated: true })
  })

  it('crea el producto en inventario con categoría, sucursal, precio y stock', async () => {
    const apiCategory = { ...category, api: true }
    useCatalogStore.setState({
      products: [],
      apiContext: { units: [unit], apiBranches: [branch], categories: [apiCategory], hydrated: true },
    })
    mocks.createProduct.mockImplementation(async (payload) => ({
      id: '4e10aecc-7885-4d0c-a308-f8a62e9ef82d',
      itemType: 'product',
      category: { id: category.id, name: category.name },
      unitOfMeasure: unit,
      branches: [branch],
      stockLocations: [],
      stockQuantity: String(payload.stock),
      minimumStock: String(payload.minimumStock),
      salePrice: String(payload.salePrice),
      unitCost: String(payload.unitCost),
      taxRate: String(payload.taxRate),
      name: payload.name,
      sku: payload.sku,
      status: 'active',
      version: 1,
    }))

    await useCatalogStore.getState().saveProduct(
      {
        name: 'Vitamina C',
        sku: 'VTC',
        type: 'product',
        category: 'otros',
        branchId: branch.id,
        unit: 'ud',
        price: '100',
        cost: '40',
        taxPct: '18',
        stock: '20',
        minStock: '5',
      },
      null,
      {
        categories: [{ id: 'otros', name: 'Otros', api: false }],
        configBranches: [branch],
        isOnline: true,
      }
    )

    expect(mocks.createProduct).toHaveBeenCalledWith({
      name: 'Vitamina C',
      sku: 'VTC',
      categoryId: category.id,
      unitOfMeasureId: unit.id,
      branchId: branch.id,
      status: 'active',
      salePrice: 100,
      unitCost: 40,
      taxRate: 18,
      stock: 20,
      minimumStock: 5,
    })
    expect(useCatalogStore.getState().products[0]).toMatchObject({
      name: 'Vitamina C',
      category: category.id,
      stock: 20,
      price: 100,
      apiSynced: true,
    })
  })
})
