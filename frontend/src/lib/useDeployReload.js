import { useEffect } from 'react'
import { checkAndReloadDeploy } from './deployReload'

const POLL_MS = 5 * 60 * 1000

export function useDeployReload() {
  useEffect(() => {
    if (import.meta.env.DEV) return

    const currentBuildId = import.meta.env.VITE_BUILD_ID
    const baseUrl = import.meta.env.BASE_URL || '/'
    let disposed = false

    async function check() {
      if (disposed || document.visibilityState === 'hidden') return
      await checkAndReloadDeploy({ currentBuildId, baseUrl })
    }

    function onVisible() {
      if (document.visibilityState === 'visible') check()
    }

    check()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    const interval = setInterval(check, POLL_MS)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      clearInterval(interval)
    }
  }, [])
}
