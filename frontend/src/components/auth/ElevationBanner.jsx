import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useSessionStore } from '@/stores/sessionStore'

function formatExpiry(iso) {
  try {
    return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function ElevationBanner() {
  const elevation = useSessionStore((s) => s.elevation)
  const revokeElevation = useSessionStore((s) => s.revokeElevation)
  const refreshCurrentUser = useSessionStore((s) => s.refreshCurrentUser)
  const isOnline = useSessionStore((s) => s.status === 'online')

  useEffect(() => {
    if (!elevation?.expiresAt) return undefined
    const remaining = new Date(elevation.expiresAt).getTime() - Date.now()
    if (remaining <= 0) {
      if (isOnline) refreshCurrentUser().catch(() => null)
      else revokeElevation().catch(() => null)
      return undefined
    }
    const timer = window.setTimeout(() => {
      if (isOnline) refreshCurrentUser().catch(() => null)
      else revokeElevation().catch(() => null)
    }, remaining + 50)
    return () => window.clearTimeout(timer)
  }, [elevation?.expiresAt, isOnline, refreshCurrentUser, revokeElevation])

  if (!elevation?.expiresAt) return null

  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
      data-testid="elevation-banner"
    >
      <p>
        Permisos elevados hasta {formatExpiry(elevation.expiresAt)}
        {elevation.grantedByName ? ` · Autorizado por ${elevation.grantedByName}` : ''}
      </p>
      <button
        type="button"
        onClick={() => revokeElevation().catch(() => null)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold hover:bg-amber-100"
        data-testid="elevation-banner-close"
      >
        Cerrar
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
