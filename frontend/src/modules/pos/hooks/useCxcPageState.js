import { useCallback, useEffect } from 'react'
import { useSessionStore } from '@/stores/sessionStore'
import { usePosStore } from '@/stores/posStore'

export function useCxcPageState() {
  const dataMode = useSessionStore((state) => state.status)
  const authenticated = useSessionStore((state) => Boolean(state.accessToken && state.user))
  const cxcHydrating = usePosStore((state) => state.cxcHydrating)
  const mutating = usePosStore((state) => state.mutating)
  const error = usePosStore((state) => state.error)
  const hydrateCxcWorkspace = usePosStore((state) => state.hydrateCxcWorkspace)

  const isOnline = dataMode === 'online'

  useEffect(() => {
    if (isOnline && !authenticated) return
    hydrateCxcWorkspace().catch(() => null)
  }, [authenticated, hydrateCxcWorkspace, isOnline])

  const refresh = useCallback(
    () => hydrateCxcWorkspace({ force: true }),
    [hydrateCxcWorkspace]
  )

  return {
    dataMode,
    isOnline,
    hydrating: cxcHydrating,
    mutating,
    error,
    refresh,
  }
}
