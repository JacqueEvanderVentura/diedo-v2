import { useEffect, useState } from 'react'

// Callers memoize load and key the component by identity and branch.
export function useCarwashRead(load, revision = 0, enabled = true) {
  const [data, setData] = useState(null)
  const [source, setSource] = useState({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let active = true
    let inFlight = false
    async function fetchData(background = false) {
      if (inFlight || (background && document.visibilityState === 'hidden')) return
      inFlight = true
      if (!background) setSource((previous) => ({ ...previous, status: 'loading' }))
      try {
        const result = await load()
        if (active) { setData(result); setSource({ status: 'ready', lastSyncedAt: new Date().toISOString() }) }
      } catch (error) {
        if (!active) return
        const denied = [401, 403, 404].includes(error.status)
        if (denied) setData(null)
        setSource((previous) => ({ ...previous, lastSyncedAt: denied ? undefined : previous.lastSyncedAt, status: denied || !previous.lastSyncedAt ? 'error' : 'stale', error }))
      } finally { inFlight = false }
    }
    fetchData()
    const interval = setInterval(() => fetchData(true), 15000)
    const visible = () => { if (document.visibilityState === 'visible') fetchData(true) }
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; clearInterval(interval); document.removeEventListener('visibilitychange', visible) }
  }, [load, enabled, revision, retry])
  return { data, source, reload: () => setRetry((value) => value + 1) }
}
