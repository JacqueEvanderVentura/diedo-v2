import { describe, expect, it } from 'vitest'
import {
  categoryKindFromUi,
  categoryKindToUi,
  filterCategoriesForSection,
  isSupplyMovementItem,
  mergeCategoryOptions,
  movementHasSupplyItems,
} from '@/lib/categories'
import { mapCategoryFromApi, mapCategoryCreatePayload } from '@/services/adapters/catalog'

describe('categories', () => {
  it('mapea categoryKind entre API y UI', () => {
    expect(categoryKindToUi('service')).toBe('servicio')
    expect(categoryKindFromUi('insumo')).toBe('supply')
    expect(mapCategoryFromApi({ id: '1', name: 'Laser', status: 'active', version: 1, categoryKind: 'service' }).type)
      .toBe('servicio')
  })

  it('envía categoryKind al crear categorías', () => {
    expect(mapCategoryCreatePayload({ name: 'Insumos', type: 'insumo', active: true }))
      .toEqual({ name: 'Insumos', description: null, categoryKind: 'supply', status: 'active' })
  })

  it('filtra catálogo y finanzas por sección', () => {
    const rows = [
      { id: 'p1', name: 'Productos', type: 'producto', active: true },
      { id: 's1', name: 'Servicios', type: 'servicio', active: true },
      { id: 'i1', name: 'Ingresos', type: 'ingreso', active: true },
      { id: 'g1', name: 'Gastos', type: 'gasto', active: true },
    ]
    expect(filterCategoriesForSection(rows, 'catalog', 'servicio')).toHaveLength(1)
    expect(filterCategoriesForSection(rows, 'finance', 'gasto')).toHaveLength(1)
  })

  it('fusiona categorías de configuración con opciones legacy', () => {
    const merged = mergeCategoryOptions(
      [{ id: 'fin-gas-alquiler', name: 'Alquiler', type: 'gasto', active: true }],
      [{ value: 'otros', label: 'Otros' }],
      'gasto'
    )
    expect(merged).toEqual([
      { value: 'fin-gas-alquiler', label: 'Alquiler' },
      { value: 'otros', label: 'Otros' },
    ])
  })

  it('detecta movimientos de insumos', () => {
    const movement = { items: [{ id: 'sup-1', sku: 'INS-01', name: 'Guantes' }] }
    expect(isSupplyMovementItem(movement.items[0])).toBe(true)
    expect(movementHasSupplyItems(movement)).toBe(true)
  })
})
