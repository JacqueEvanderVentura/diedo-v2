import { describe, expect, it } from 'vitest'
import {
  defaultUnitId,
  mergeApiProduct,
  projectProductToBranch,
  resolveCategoryId,
} from '@/lib/catalogSync'

const apiCategories = [
  { id: '77f9c771-9b2a-40af-ae14-311bc4c703ea', name: 'Otros', api: true },
  { id: '8cce9d94-c849-447a-b729-2b27f1922f50', name: 'Insumos', api: true },
]

describe('sincronización del catálogo de inventario', () => {
  it('resuelve el id estático de la categoría contra la categoría de la API', () => {
    expect(resolveCategoryId('otros', apiCategories)).toBe(apiCategories[0].id)
    expect(resolveCategoryId('insumos', apiCategories)).toBe(apiCategories[1].id)
    expect(resolveCategoryId('categoria-inexistente', apiCategories)).toBeNull()
  })

  it('conserva los valores reales de inventario al mapear un producto', () => {
    const product = mergeApiProduct(
      {
        id: 'product-id',
        itemType: 'product',
        name: 'Vitamina C',
        sku: 'VTC',
        category: { id: apiCategories[0].id },
        unitOfMeasure: { id: 'unit-id', symbol: 'ud' },
        branches: [{ id: 'branch-id' }],
        salePrice: '100.00',
        unitCost: '42.50',
        taxRate: '18.00',
        stockQuantity: '20.000',
        minimumStock: '5.000',
        status: 'active',
        version: 1,
      },
      null,
      new Map([[apiCategories[0].id, apiCategories[0].id]])
    )

    expect(product).toMatchObject({
      type: 'product',
      price: 100,
      cost: 42.5,
      taxPct: 18,
      stock: 20,
      minStock: 5,
      category: apiCategories[0].id,
      apiSynced: true,
    })
  })

  it('reconoce insumos y equivalencias de unidades de medida', () => {
    const units = [
      { id: 'unit', code: 'unit', name: 'Unidad', symbol: 'ud' },
      { id: 'liter', code: 'liter', name: 'Litro', symbol: 'l' },
    ]
    expect(defaultUnitId(units, 'lt')).toBe('liter')
    expect(defaultUnitId(units, 'caja')).toBe('unit')

    const supply = mergeApiProduct(
      {
        id: 'supply-id',
        itemType: 'supply',
        name: 'Alcohol',
        category: { id: apiCategories[1].id },
        unitOfMeasure: units[1],
        branches: [],
        unitCost: '280.00',
        taxRate: '0.00',
        stockQuantity: '36.000',
        minimumStock: '8.000',
      },
      null,
      new Map([[apiCategories[1].id, apiCategories[1].id]])
    )
    expect(supply).toMatchObject({ type: 'supply', price: 0, cost: 280, stock: 36, minStock: 8 })
  })

  it('proyecta el stock real de la sucursal aunque no sea la primera asignada', () => {
    const product = mergeApiProduct(
      {
        id: 'alcohol-id',
        itemType: 'supply',
        name: 'Alcohol isopropílico 70%',
        sku: 'ALC-ISO-70',
        category: { id: apiCategories[1].id },
        unitOfMeasure: { id: 'liter', symbol: 'l' },
        branches: [{ id: 'downtown' }, { id: 'east' }],
        stockLocations: [
          {
            branch: { id: 'downtown' },
            warehouseId: 'warehouse-downtown',
            quantity: '6.000',
            minimumStock: '8.000',
            stockStatus: 'low',
          },
          {
            branch: { id: 'east' },
            warehouseId: 'warehouse-east',
            quantity: '0.000',
            minimumStock: '8.000',
            stockStatus: 'out',
          },
        ],
        unitCost: '280.00',
        stockQuantity: '6.000',
        minimumStock: '16.000',
      },
      null,
      new Map([[apiCategories[1].id, apiCategories[1].id]])
    )

    expect(projectProductToBranch(product, 'east')).toMatchObject({
      branchId: 'east',
      stock: 0,
      minStock: 8,
    })
    expect(projectProductToBranch(product, 'north')).toBeNull()
  })
})
