import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyInventorySupplyToRequestItem,
  applySupplierCatalogToRequestItem,
  mergePurchaseRequestExtras,
  savePurchaseRequestExtras,
} from '@/modules/compras/lib/purchaseRequestExtras'
import { purchaseLinesForInventory } from '@/modules/compras/lib/receivePurchaseInventory'

describe('purchaseRequestExtras', () => {
  beforeEach(() => {
    const store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    })
  })

  it('restaura cotización e insumos vinculados', () => {
    savePurchaseRequestExtras('req-1', {
      quoteFile: { name: 'cot.pdf', contentType: 'application/pdf', dataUrl: 'data:application/pdf;base64,abc' },
      items: [{ supplyProductId: 'sup-1', supplyCategoryId: 'cat-insumo' }],
    })
    const merged = mergePurchaseRequestExtras({
      id: 'req-1',
      items: [{ name: 'Guantes', qty: 2 }],
    })
    expect(merged.quoteFile?.name).toBe('cot.pdf')
    expect(merged.items[0].supplyProductId).toBe('sup-1')
  })

  it('al elegir el catálogo del proveedor llena descripción, unidad, precio y categoría', () => {
    const next = applySupplierCatalogToRequestItem(
      {
        name: 'Gel conductor láser',
        qty: 2,
        unit: 'L',
        price: 0,
        supplyProductId: 'sup-gel',
        supplyCategoryId: '',
      },
      { id: 'cat-item-1', name: 'Fabuloso 2Lt', unit: 'Unidad', unitPrice: 120, categoryId: 'cat-limpieza' },
      [{ id: 'sup-gel', name: 'Gel conductor láser', unit: 'L' }],
      [{ id: 'cat-limpieza', name: 'Limpieza' }],
    )
    expect(next).toMatchObject({
      catalogItemId: 'cat-item-1',
      name: 'Fabuloso 2Lt',
      qty: 2,
      unit: 'Unidad',
      price: 120,
      categoryId: 'cat-limpieza',
      supplyCategoryId: 'cat-limpieza',
      supplyProductId: '',
    })
  })

  it('vincula el insumo de inventario solo si el nombre coincide', () => {
    const next = applySupplierCatalogToRequestItem(
      { name: '', qty: 1, unit: 'Unidad', price: 0 },
      { id: 'cat-item-1', name: 'Fabuloso 2Lt', unit: 'Unidad', unitPrice: 45, categoryId: 'cat-1' },
      [{ id: 'sup-fab', name: 'Fabuloso 2Lt', unit: 'Unidad', categoryId: 'cat-1' }],
    )
    expect(next.supplyProductId).toBe('sup-fab')
  })

  it('al elegir un insumo llena categoría con el id de catálogo', () => {
    const next = applyInventorySupplyToRequestItem(
      emptyLine(),
      { id: 'sup-1', name: 'Gel', unit: 'L', category: 'otros', categoryId: 'cat-insumo' },
      [{ id: 'cat-insumo', name: 'Insumos' }, { id: 'otros', name: 'Otros' }],
    )
    expect(next).toMatchObject({
      supplyProductId: 'sup-1',
      name: 'Gel',
      unit: 'Litro',
      supplyCategoryId: 'cat-insumo',
      categoryId: 'cat-insumo',
    })
  })

  it('al elegir un insumo distinto al catálogo usa su unidad y suelta el producto del proveedor', () => {
    const next = applyInventorySupplyToRequestItem(
      {
        name: 'Fabuloso 2Lt',
        qty: 2,
        unit: 'Unidad',
        price: 120,
        catalogItemId: 'cat-item-1',
        supplyProductId: '',
        supplyCategoryId: 'cat-limpieza',
        categoryId: 'cat-limpieza',
      },
      { id: 'sup-gel', name: 'Gel conductor láser', unit: 'L', categoryId: 'cat-insumo' },
      [{ id: 'cat-limpieza', name: 'Limpieza' }, { id: 'cat-insumo', name: 'Insumos' }],
    )
    expect(next).toMatchObject({
      catalogItemId: '',
      supplyProductId: 'sup-gel',
      name: 'Gel conductor láser',
      unit: 'Litro',
      supplyCategoryId: 'cat-insumo',
      categoryId: 'cat-insumo',
      price: 120,
    })
  })
})

function emptyLine() {
  return { name: '', qty: 1, unit: 'Unidad', price: 0, supplyProductId: '', supplyCategoryId: '', categoryId: '' }
}

describe('receivePurchaseInventory helpers', () => {
  it('filtra líneas con insumo vinculado', () => {
    const lines = purchaseLinesForInventory({
      items: [
        { name: 'A', qty: 1, supplyProductId: 'sup-1' },
        { name: 'B', qty: 2 },
      ],
    })
    expect(lines).toHaveLength(1)
  })
})
