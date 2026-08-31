import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'

export function AuthGate() {
  const location = useLocation()
  const initialized = useSessionStore((s) => s.initialized)
  const status = useSessionStore((s) => s.status)
  const isAuthenticated = useSessionStore((s) => Boolean(s.accessToken && s.user))

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

  return <Outlet />
}
