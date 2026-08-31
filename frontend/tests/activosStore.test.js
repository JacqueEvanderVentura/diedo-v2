import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listAllAssets: vi.fn(),
  listAssetCategories: vi.fn(),
  getAssetSummary: vi.fn(),
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
}))

vi.mock('@/services/inventoryApi', () => ({ inventoryApi: mocks }))

import { useActivosStore } from '@/stores/activosStore'

const category = {
  id: '784eb8bc-4f49-4a08-ab0e-a100968f12e5',
  code: 'equipos',
  name: 'Equipos',
  status: 'active',
  version: 1,
}
const branch = {
  id: '01a03129-a18a-724f-ba73-96eedf0b84d7',
  code: 'NORTH',
  name: 'Sucursal Norte',
}

function apiAsset(overrides = {}) {
  return {
    id: '3883a50d-e0bb-4dfc-97f0-367d80db3b75',
    name: 'Equipo láser diodo',
    code: 'EQP-NOR-001',
    category,
    branch,
    acquisitionValue: '285000.00',
    status: 'activo',
    location: 'Cabina 1',
    purchaseDate: '2024-02-05',
    notes: null,
    version: 1,
    createdAt: '2026-08-31T10:00:00Z',
    updatedAt: '2026-08-31T10:00:00Z',
    ...overrides,
  }
}

describe('store de activos conectado al inventario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useActivosStore.setState({
      activos: [],
      categories: [],
      summary: null,
      apiContext: { hydrated: false },
      hydrating: false,
      error: null,
    })
  })

  it('carga listado, taxonomía independiente y resumen desde la API', async () => {
    mocks.listAllAssets.mockResolvedValue({ items: [apiAsset()] })
    mocks.listAssetCategories.mockResolvedValue([category])
    mocks.getAssetSummary.mockResolvedValue({
      totalValue: '285000.00',
      operational: 1,
      inRepair: 0,
      retired: 0,
    })

    await useActivosStore.getState().hydrateFromApi()

    expect(mocks.listAllAssets).toHaveBeenCalledWith({ sortBy: 'name', sortDirection: 'asc' })
    expect(useActivosStore.getState()).toMatchObject({
      activos: [expect.objectContaining({ id: apiAsset().id, category: 'equipos', value: 285000 })],
      categories: [expect.objectContaining({ id: 'equipos', apiId: category.id })],
      summary: { count: 1, totalValue: 285000, operativos: 1, reparacion: 0, baja: 0 },
      apiContext: { hydrated: true },
    })
  })

  it('envía el POST completo y agrega la respuesta versionada al listado', async () => {
    useActivosStore.setState({
      activos: [],
      categories: [{ id: 'equipos', apiId: category.id, name: 'Equipos', apiSynced: true }],
      apiContext: { hydrated: true },
    })
    mocks.createAsset.mockResolvedValue(apiAsset())

    await useActivosStore.getState().saveActivo({
      name: 'Equipo láser diodo',
      code: 'EQP-NOR-001',
      category: 'equipos',
      branchId: branch.id,
      value: '285000',
      status: 'activo',
      location: 'Cabina 1',
      purchaseDate: '2024-02-05',
      notes: '',
    }, null, { isOnline: true })

    expect(mocks.createAsset).toHaveBeenCalledWith({
      name: 'Equipo láser diodo',
      code: 'EQP-NOR-001',
      categoryId: category.id,
      branchId: branch.id,
      acquisitionValue: 285000,
      status: 'activo',
      location: 'Cabina 1',
      purchaseDate: '2024-02-05',
      notes: null,
    })
    expect(useActivosStore.getState().activos[0]).toMatchObject({
      id: apiAsset().id,
      version: 1,
      apiSynced: true,
    })
  })

  it('da de baja mediante PATCH versionado sin borrar el activo', async () => {
    const mapped = {
      id: apiAsset().id,
      name: apiAsset().name,
      code: apiAsset().code,
      category: 'equipos',
      categoryId: category.id,
      branchId: branch.id,
      value: 285000,
      status: 'activo',
      location: 'Cabina 1',
      purchaseDate: '2024-02-05',
      notes: '',
      version: 1,
      apiSynced: true,
    }
    useActivosStore.setState({
      activos: [mapped],
      categories: [{ id: 'equipos', apiId: category.id, name: 'Equipos', apiSynced: true }],
      apiContext: { hydrated: true },
    })
    mocks.updateAsset.mockResolvedValue(apiAsset({ status: 'baja', version: 2 }))

    await useActivosStore.getState().retireActivo(mapped.id, { isOnline: true })

    expect(mocks.updateAsset).toHaveBeenCalledWith(mapped.id, { version: 1, status: 'baja' })
    expect(useActivosStore.getState().activos).toHaveLength(1)
    expect(useActivosStore.getState().activos[0]).toMatchObject({ status: 'baja', version: 2 })
    expect(useActivosStore.getState().getStats()).toMatchObject({ totalValue: 0, baja: 1 })
  })
})
