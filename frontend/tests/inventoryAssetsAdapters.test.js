import { describe, expect, it } from 'vitest'
import {
  assetToApiPayload,
  mapAssetCategoryFromApi,
  mapAssetFromApi,
  mapAssetSummaryFromApi,
} from '@/services/adapters/inventory'

const categoryResponse = {
  id: '784eb8bc-4f49-4a08-ab0e-a100968f12e5',
  code: 'equipos',
  name: 'Equipos',
  status: 'active',
  version: 1,
}

describe('adaptadores de activos de inventario', () => {
  it('mantiene separada la categoría de activos y conserva su UUID de API', () => {
    expect(mapAssetCategoryFromApi(categoryResponse)).toEqual({
      id: 'equipos',
      apiId: categoryResponse.id,
      name: 'Equipos',
      status: 'active',
      version: 1,
      apiSynced: true,
    })
  })

  it('mapea el contrato de activos al modelo visual de la pantalla', () => {
    const asset = mapAssetFromApi({
      id: 'asset-id',
      name: 'Equipo láser diodo',
      code: 'EQP-001',
      category: categoryResponse,
      branch: { id: 'branch-id', code: 'NORTH', name: 'Sucursal Norte' },
      acquisitionValue: '285000.00',
      status: 'reparacion',
      location: 'Cabina 1',
      purchaseDate: '2024-02-05',
      notes: 'Mantenimiento',
      version: 3,
      createdAt: '2026-08-31T10:00:00Z',
      updatedAt: '2026-08-31T11:00:00Z',
    })

    expect(asset).toMatchObject({
      id: 'asset-id',
      category: 'equipos',
      categoryId: categoryResponse.id,
      branchId: 'branch-id',
      value: 285000,
      status: 'reparacion',
      version: 3,
      apiSynced: true,
    })
  })

  it('construye el POST con todos los campos visibles en el formulario', () => {
    const category = mapAssetCategoryFromApi(categoryResponse)
    expect(assetToApiPayload({
      name: ' Equipo láser ',
      code: ' eqp-001 ',
      category: 'equipos',
      branchId: 'branch-id',
      value: '42000',
      status: 'activo',
      location: ' Sala 2 ',
      purchaseDate: '2026-08-31',
      notes: ' Preventivo ',
    }, [category])).toEqual({
      name: 'Equipo láser',
      code: 'eqp-001',
      categoryId: categoryResponse.id,
      branchId: 'branch-id',
      acquisitionValue: 42000,
      status: 'activo',
      location: 'Sala 2',
      purchaseDate: '2026-08-31',
      notes: 'Preventivo',
    })
  })

  it('normaliza el resumen independiente de activos', () => {
    expect(mapAssetSummaryFromApi({
      totalValue: '365500.00',
      operational: 6,
      inRepair: 2,
      retired: 1,
    })).toEqual({ totalValue: 365500, operativos: 6, reparacion: 2, baja: 1 })
  })
})
