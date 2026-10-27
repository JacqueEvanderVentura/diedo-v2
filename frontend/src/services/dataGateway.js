export const DATA_STATES = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  STALE: 'stale',
  ERROR: 'error',
})

export class MutationBlockedError extends Error {
  constructor(message = 'Las mutaciones están bloqueadas mientras la API no está disponible.') {
    super(message)
    this.name = 'MutationBlockedError'
  }
}

export class TenantStateChangedError extends Error {
  constructor(message = 'La respuesta pertenece a un contexto anterior y fue descartada.') {
    super(message)
    this.name = 'TenantStateChangedError'
  }
}

const gateways = new Set()

export function createModuleGateway({ module, apiRepository }) {
  const cached = new Map()
  const pendingReads = new Set()
  let generation = 0
  let state = { module, status: DATA_STATES.LOADING, source: null, lastSyncedAt: null, error: null }

  const assertCurrentGeneration = (requestGeneration) => {
    if (requestGeneration !== generation) throw new TenantStateChangedError()
  }

  const readFromApi = async (operation, ...args) => {
    const requestGeneration = generation
    const cacheKey = `${operation}:${JSON.stringify(args)}`
    state = { ...state, status: DATA_STATES.LOADING, error: null }
    try {
      const data = await apiRepository[operation](...args)
      assertCurrentGeneration(requestGeneration)
      cached.set(cacheKey, structuredClone(data))
      state = {
        module,
        status: DATA_STATES.READY,
        source: 'api',
        lastSyncedAt: new Date().toISOString(),
        error: null,
      }
      return { data, ...state }
    } catch (error) {
      assertCurrentGeneration(requestGeneration)
      if (cached.has(cacheKey)) {
        state = { ...state, status: DATA_STATES.STALE, source: 'cache', error }
        return { data: structuredClone(cached.get(cacheKey)), ...state }
      }
      state = { ...state, status: DATA_STATES.ERROR, source: null, error }
      throw error
    }
  }

  const gateway = {
    getState: () => state,

    read(operation, ...args) {
      const request = readFromApi(operation, ...args)
      const settle = () => pendingReads.delete(request)
      pendingReads.add(request)
      request.then(settle, settle)
      return request
    },

    async mutate(operation, ...args) {
      const requestGeneration = generation
      if (state.status === DATA_STATES.LOADING && pendingReads.size > 0) {
        await Promise.allSettled([...pendingReads])
        assertCurrentGeneration(requestGeneration)
      }
      if (state.status !== DATA_STATES.READY || state.source !== 'api') {
        throw new MutationBlockedError()
      }
      const result = await apiRepository[operation](...args)
      assertCurrentGeneration(requestGeneration)
      return result
    },

    clear() {
      generation += 1
      cached.clear()
      pendingReads.clear()
      state = {
        module,
        status: DATA_STATES.LOADING,
        source: null,
        lastSyncedAt: null,
        error: null,
      }
    },
  }
  gateways.add(gateway)
  return gateway
}

export function clearModuleGatewayCaches() {
  gateways.forEach((gateway) => gateway.clear())
}
