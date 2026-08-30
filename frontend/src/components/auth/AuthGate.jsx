import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import { isModuleAvailable, routeRequirement } from '@/services/moduleAvailability'

export function AuthGate() {
  const location = useLocation()
  const initialized = useSessionStore((s) => s.initialized)
  const status = useSessionStore((s) => s.status)
  const user = useSessionStore((s) => s.user)
  const bootstrap = useSessionStore((s) => s.bootstrap)
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated())

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="mt-4 text-sm text-slate-500">Conectando…</p>
        </div>
      </div>
    )
  }

  if (status === 'online' && !isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (status === 'degraded' && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <h1 className="font-heading text-xl font-bold text-slate-900">Servicio temporalmente no disponible</h1>
          <p className="mt-2 text-sm text-slate-500">
            No se mostrarán datos demo ni se permitirán cambios hasta recuperar la API.
          </p>
          <button
            type="button"
            onClick={() => bootstrap({ force: true })}
            className="mt-5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Reintentar conexión
          </button>
        </div>
      </div>
    )
  }

  if (status === 'online' && user) {
    const requirement = routeRequirement(location.pathname)
    if (requirement?.module && !isModuleAvailable(requirement.module, user.enabledModules)) {
      return <Navigate to="/dashboard" replace />
    }
    if (
      requirement?.permission &&
      !user.effectivePermissionCodes?.includes(requirement.permission)
    ) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return <Outlet />
}
