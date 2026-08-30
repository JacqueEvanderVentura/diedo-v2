import { describe, expect, it, vi } from 'vitest'
import {
  createModuleGateway,
  DATA_STATES,
  MutationBlockedError,
  TenantStateChangedError,
} from '@/services/dataGateway'

describe('createModuleGateway', () => {
  it('expone ready desde API y permite mutaciones solo entonces', async () => {
    const api = {
      list: vi.fn().mockResolvedValue([{ id: 1 }]),
      update: vi.fn().mockResolvedValue({ id: 1, name: 'Actualizado' }),
    }
    const gateway = createModuleGateway({ module: 'test', apiRepository: api })

    await expect(gateway.mutate('update', 1)).rejects.toBeInstanceOf(MutationBlockedError)
    const result = await gateway.read('list')

    expect(result.status).toBe(DATA_STATES.READY)
    expect(result.source).toBe('api')
    await expect(gateway.mutate('update', 1)).resolves.toEqual({ id: 1, name: 'Actualizado' })
  })

  it('sirve cache stale ante un fallo posterior y bloquea mutaciones', async () => {
    const list = vi.fn().mockResolvedValueOnce([{ id: 1 }]).mockRejectedValueOnce(new Error('offline'))
    const gateway = createModuleGateway({ module: 'test', apiRepository: { list, update: vi.fn() } })

    await gateway.read('list')
    const result = await gateway.read('list')

    expect(result.status).toBe(DATA_STATES.STALE)
    expect(result.source).toBe('cache')
    expect(result.data).toEqual([{ id: 1 }])
    await expect(gateway.mutate('update', 1)).rejects.toBeInstanceOf(MutationBlockedError)
  })

  it('distingue error sin cache de demo explícito', async () => {
    const errorGateway = createModuleGateway({
      module: 'error',
      apiRepository: { list: vi.fn().mockRejectedValue(new Error('offline')) },
    })
    await expect(errorGateway.read('list')).rejects.toThrow('offline')
    expect(errorGateway.getState().status).toBe(DATA_STATES.ERROR)

    const realWorkspaceGateway = createModuleGateway({
      module: 'real-workspace',
      apiRepository: { list: vi.fn().mockRejectedValue(new Error('offline')) },
      demoRepository: { list: vi.fn().mockResolvedValue([{ id: 'demo' }]) },
      demoEnabled: true,
      demoActive: () => false,
    })
    await expect(realWorkspaceGateway.read('list')).rejects.toThrow('offline')
    expect(realWorkspaceGateway.getState().status).toBe(DATA_STATES.ERROR)

    const demoList = vi.fn().mockResolvedValue([{ id: 'demo' }])
    const demoApiList = vi.fn().mockRejectedValue(new Error('offline'))
    const demoGateway = createModuleGateway({
      module: 'demo',
      apiRepository: { list: demoApiList },
      demoRepository: { list: demoList },
      demoEnabled: true,
      demoActive: () => true,
    })
    const result = await demoGateway.read('list')
    expect(result.status).toBe(DATA_STATES.DEMO)
    expect(result.source).toBe('demo')
    expect(result.data).toEqual([{ id: 'demo' }])
    expect(demoList).toHaveBeenCalledOnce()
    expect(demoApiList).not.toHaveBeenCalled()
  })

  it('descarta una lectura tardía después de limpiar el tenant', async () => {
    let resolveList
    const list = vi.fn(() => new Promise((resolve) => {
      resolveList = resolve
    }))
    const gateway = createModuleGateway({ module: 'tenant-read', apiRepository: { list } })
    const pending = gateway.read('list')

    gateway.clear()
    resolveList([{ id: 'old-workspace' }])

    await expect(pending).rejects.toBeInstanceOf(TenantStateChangedError)
    expect(gateway.getState()).toMatchObject({ status: DATA_STATES.LOADING, source: null })
  })

  it('no entrega al store el resultado de una mutación de un tenant anterior', async () => {
    let resolveUpdate
    const update = vi.fn(() => new Promise((resolve) => {
      resolveUpdate = resolve
    }))
    const gateway = createModuleGateway({
      module: 'tenant-mutation',
      apiRepository: { list: vi.fn().mockResolvedValue([]), update },
    })
    await gateway.read('list')
    const pending = gateway.mutate('update', 'item-1')

    gateway.clear()
    resolveUpdate({ id: 'item-1', workspace: 'old' })

    await expect(pending).rejects.toBeInstanceOf(TenantStateChangedError)
  })
})
