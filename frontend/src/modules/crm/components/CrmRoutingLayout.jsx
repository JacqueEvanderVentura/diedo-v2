import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useCrmStore } from '@/stores/crmStore'
import { isStandardCrmPath } from '@/modules/crm/lib/crmNavigation'

export function CrmRoutingLayout() {
  const location = useLocation()
  const uiMode = useCrmStore((state) => state.uiMode)
  const workspaceSettingsLoaded = useCrmStore((state) => state.workspaceSettingsLoaded)
  const ensureWorkspaceSettings = useCrmStore((state) => state.ensureWorkspaceSettings)

  useEffect(() => {
    ensureWorkspaceSettings().catch(() => {})
  }, [ensureWorkspaceSettings])

  const pathname = location.pathname
  const onWorkspace = pathname === '/crm/workspace' || pathname.startsWith('/crm/workspace/')

  if (!workspaceSettingsLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500" data-testid="crm-routing-loading">
        Cargando preferencias del CRM…
      </div>
    )
  }

  if (uiMode === 'simplified' && isStandardCrmPath(pathname)) {
    return <Navigate to="/crm/workspace" replace />
  }

  if (uiMode === 'standard' && onWorkspace) {
    return <Navigate to="/crm" replace />
  }

  return <Outlet />
}
