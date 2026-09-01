import { describe, expect, it, vi } from 'vitest'
import { createFlashItemForPos } from '@/modules/pos/lib/flashItem'

describe('alta rápida de ítems POS', () => {
  it('crea online, rehidrata y agrega al carrito sólo el ítem UUID devuelto por API', async () => {
    const product = {
      id: '4e10aecc-7885-4d0c-a308-f8a62e9ef82d',
      name: 'Servicio rápido',
      type: 'service',
      price: 100,
      apiSynced: true,
    }
    const saveProduct = vi.fn().mockResolvedValue(product.id)
    const hydratePos = vi.fn().mockResolvedValue(null)
    const addItem = vi.fn()

    await expect(createFlashItemForPos({
      data: { name: product.name, type: 'service', branchId: 'branch-id' },
      isOnline: true,
      canManageCatalog: true,
      categories: [],
      configBranches: [],
      addProduct: vi.fn(),
      saveProduct,
      addItem,
      hydratePos,
      getPosCatalog: () => [product],
    })).resolves.toBe(product)

    expect(saveProduct).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-id' }),
      null,
      expect.objectContaining({ isOnline: true })
    )
    expect(hydratePos).toHaveBeenCalledWith('branch-id', { force: true })
    expect(addItem).toHaveBeenCalledWith(product)
  })

  it('impide crear online sin catalog.manage antes de tocar la API', async () => {
    const saveProduct = vi.fn()

    await expect(createFlashItemForPos({
      data: { name: 'Sin permiso', branchId: 'branch-id' },
      isOnline: true,
      canManageCatalog: false,
      categories: [],
      configBranches: [],
      addProduct: vi.fn(),
      saveProduct,
      addItem: vi.fn(),
      hydratePos: vi.fn(),
      getPosCatalog: () => [],
    })).rejects.toThrow('No tienes permiso')

    expect(saveProduct).not.toHaveBeenCalled()
  })
})
