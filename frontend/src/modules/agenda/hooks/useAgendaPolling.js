import { useEffect, useMemo } from 'react'
import { useAgendaStore } from '@/stores/agendaStore'
import { useSessionStore } from '@/stores/sessionStore'

const POLL_INTERVAL_MS = 10000

export function useAgendaPolling(params = {}) {
  const hydrateAppointments = useAgendaStore((state) => state.hydrateAppointments)
  const sessionStatus = useSessionStore((state) => state.status)
  const queryKey = JSON.stringify(params)
  const query = useMemo(() => JSON.parse(queryKey), [queryKey])

  useEffect(() => {
    if (!['online', 'demo'].includes(sessionStatus)) return undefined
    let disposed = false

    const refresh = async () => {
      if (disposed || (document.hidden && document.visibilityState !== 'visible')) return
      try {
        await hydrateAppointments({ force: true, params: query })
      } catch {
        // The gateway exposes the recoverable error/stale state to the page.
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    refresh()
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [hydrateAppointments, query, sessionStatus])
}

