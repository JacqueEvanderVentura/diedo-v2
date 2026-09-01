import { useCallback, useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function usePosOnlineState() {
  const dataMode = useSessionStore((state) => state.status)
  const authenticated = useSessionStore((state) => Boolean(state.accessToken && state.user))
  const branches = useConfigStore((state) => state.branches)
  const branchId = usePosStore((state) => state.branchId)
  const apiContext = usePosStore((state) => state.apiContext)
  const hydrating = usePosStore((state) => state.hydrating)
  const mutating = usePosStore((state) => state.mutating)
  const error = usePosStore((state) => state.error)
  const setBranch = usePosStore((state) => state.setBranch)
  const hydrateFromApi = usePosStore((state) => state.hydrateFromApi)
  const resetOnlineState = usePosStore((state) => state.resetOnlineState)

  const isOnline = dataMode === 'online'

  useEffect(() => {
    if (!isOnline) {
      if (dataMode === 'demo' && apiContext.mode !== 'demo') resetOnlineState()
      return
    }
    if (!authenticated) return
    const onlineBranches = branches.filter((branch) => UUID_PATTERN.test(branch.id))
    if (!onlineBranches.length) return
    if (!onlineBranches.some((branch) => branch.id === branchId)) {
      setBranch(onlineBranches[0].id)
      return
    }
    hydrateFromApi(branchId).catch(() => null)
  }, [
    apiContext.mode,
    authenticated,
    branchId,
    branches,
    dataMode,
    hydrateFromApi,
    isOnline,
    resetOnlineState,
    setBranch,
  ])

  const refresh = useCallback(() => {
    if (!isOnline || !branchId) return Promise.resolve(null)
    return hydrateFromApi(branchId, { force: true })
  }, [branchId, hydrateFromApi, isOnline])

  return {
    dataMode,
    isOnline,
    hydrated: apiContext.hydrated,
    hydrating,
    mutating,
    error,
    refresh,
  }
}
