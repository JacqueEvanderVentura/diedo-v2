import { useCallback, useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'
import { isOnlineBranchId } from '@/modules/pos/lib/registerBranchState'

export function useCajaBranchState() {
  const dataMode = useSessionStore((state) => state.status)
  const authenticated = useSessionStore((state) => Boolean(state.accessToken && state.user))
  const branches = useConfigStore((state) => state.branches)
  const cajaBranchId = usePosStore((state) => state.cajaBranchId)
  const hydrating = usePosStore((state) => state.cajaHydrating || state.hydrating)
  const mutating = usePosStore((state) => state.mutating)
  const error = usePosStore((state) => state.error)
  const setCajaBranch = usePosStore((state) => state.setCajaBranch)
  const hydrateCajaBranch = usePosStore((state) => state.hydrateCajaBranch)
  const hydrateRegisterHistory = usePosStore((state) => state.hydrateRegisterHistory)

  const isOnline = dataMode === 'online'

  useEffect(() => {
    if (!isOnline || !authenticated) return
    const onlineBranches = branches.filter((branch) => isOnlineBranchId(branch.id))
    if (!onlineBranches.length) return
    if (!onlineBranches.some((branch) => branch.id === cajaBranchId)) {
      setCajaBranch(onlineBranches[0].id)
      return
    }
    hydrateCajaBranch(cajaBranchId).catch(() => null)
    hydrateRegisterHistory().catch(() => null)
  }, [
    authenticated,
    branches,
    cajaBranchId,
    hydrateCajaBranch,
    hydrateRegisterHistory,
    isOnline,
    setCajaBranch,
  ])

  const refresh = useCallback(() => {
    if (!isOnline || !cajaBranchId) return Promise.resolve(null)
    return Promise.all([
      hydrateCajaBranch(cajaBranchId, { force: true }),
      hydrateRegisterHistory({ force: true }),
    ])
  }, [cajaBranchId, hydrateCajaBranch, hydrateRegisterHistory, isOnline])

  return {
    dataMode,
    isOnline,
    hydrating,
    mutating,
    error,
    refresh,
  }
}
