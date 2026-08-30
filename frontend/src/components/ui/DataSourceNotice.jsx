import { AlertTriangle, Database, FlaskConical, RefreshCw } from 'lucide-react'
import { Button } from './Button'

const COPY = {
  loading: {
    icon: RefreshCw,
    tone: 'border-blue-200 bg-blue-50 text-blue-800',
    title: 'Sincronizando con la API…',
  },
  stale: {
    icon: AlertTriangle,
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    title: 'Mostrando la última copia disponible en memoria.',
  },
  error: {
    icon: AlertTriangle,
    tone: 'border-red-200 bg-red-50 text-red-800',
    title: 'No fue posible cargar estos datos.',
  },
  demo: {
    icon: FlaskConical,
    tone: 'border-violet-200 bg-violet-50 text-violet-800',
    title: 'Datos locales del entorno demo.',
  },
  ready: {
    icon: Database,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    title: 'Datos sincronizados con la API.',
  },
}

export function DataSourceNotice({ state, onRetry, className = '' }) {
  const status = state?.status || 'loading'
  const meta = COPY[status] || COPY.error
  const Icon = meta.icon
  const synced = state?.lastSyncedAt
    ? new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(state.lastSyncedAt))
    : null
  const retry = () => {
    Promise.resolve(onRetry?.()).catch(() => {})
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${meta.tone} ${className}`}>
      <Icon className={`h-4 w-4 shrink-0 ${status === 'loading' ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{meta.title}</p>
        {synced && <p className="mt-0.5 text-xs opacity-75">Última sincronización: {synced}</p>}
        {state?.error?.message && status !== 'ready' && (
          <p className="mt-0.5 truncate text-xs opacity-75">{state.error.message}</p>
        )}
      </div>
      {onRetry && ['stale', 'error'].includes(status) && (
        <Button type="button" size="sm" variant="secondary" onClick={retry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}
