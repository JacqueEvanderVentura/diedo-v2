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

  it('espera una relectura en curso en vez de bloquear la mutación', async () => {
    let resolveRefresh
    const list = vi.fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve
      }))
    const update = vi.fn().mockResolvedValue({ id: 1, name: 'Guardado' })
    const gateway = createModuleGateway({ module: 'refresh', apiRepository: { list, update } })
    await gateway.read('list')

    const refresh = gateway.read('list')
    expect(gateway.getState().status).toBe(DATA_STATES.LOADING)
    const saving = gateway.mutate('update', 1)
    expect(update).not.toHaveBeenCalled()

    resolveRefresh([{ id: 1 }])
    await refresh
    await expect(saving).resolves.toEqual({ id: 1, name: 'Guardado' })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('sigue bloqueando si la relectura en curso falla', async () => {
    let rejectRefresh
    const list = vi.fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockImplementationOnce(() => new Promise((_, reject) => {
        rejectRefresh = reject
      }))
    const update = vi.fn()
    const gateway = createModuleGateway({ module: 'refresh-fail', apiRepository: { list, update } })
    await gateway.read('list')

    const refresh = gateway.read('list')
    const saving = gateway.mutate('update', 1)
    rejectRefresh(new Error('offline'))
    await refresh

    await expect(saving).rejects.toBeInstanceOf(MutationBlockedError)
    expect(update).not.toHaveBeenCalled()
  })

  it('propaga error cuando no hay cache previo', async () => {
    const errorGateway = createModuleGateway({
      module: 'error',
      apiRepository: { list: vi.fn().mockRejectedValue(new Error('offline')) },
    })
    await expect(errorGateway.read('list')).rejects.toThrow('offline')
    expect(errorGateway.getState().status).toBe(DATA_STATES.ERROR)
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
