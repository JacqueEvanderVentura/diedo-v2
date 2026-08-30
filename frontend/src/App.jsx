import { Toaster } from 'sonner'
import { useEffect } from 'react'
import { AppRoutes } from './router'
import { useLenis } from './lib/useLenis'
import { useSessionStore } from './stores/sessionStore'
import { useCustomersStore } from './stores/customersStore'
import { useRrhhStore } from './stores/rrhhStore'
import { configFacade } from './services/configFacade'

export default function App() {
  useLenis(false)
  const bootstrap = useSessionStore((s) => s.bootstrap)
  const initialized = useSessionStore((s) => s.initialized)
  const status = useSessionStore((s) => s.status)
  const workspaceId = useSessionStore((s) => s.user?.workspaceId)
  const visibleBranches = useSessionStore((s) => s.user?.visibleBranches)
  const hydrateCustomers = useCustomersStore((s) => s.hydrate)
  const hydrateEmployees = useRrhhStore((s) => s.hydrateEmployees)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (!initialized) return
    configFacade.synchronizeSessionBranches({ status, workspaceId, visibleBranches })
    if (status !== 'demo' && !workspaceId) return
    Promise.allSettled([
      hydrateCustomers({ force: true }),
      hydrateEmployees({ force: true }),
    ])
  }, [hydrateCustomers, hydrateEmployees, initialized, status, visibleBranches, workspaceId])

  return (
    <>
      <AppRoutes />
      <Toaster
        position="top-center"
        richColors
        expand={false}
        visibleToasts={1}
        toastOptions={{
          style: {
            borderRadius: '0.75rem',
            fontFamily: 'Inter, sans-serif',
          },
        }}
      />
    </>
  )
}
