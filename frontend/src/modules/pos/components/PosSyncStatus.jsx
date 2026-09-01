import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PosSyncStatus({ isOnline, hydrating, error, onRetry, className }) {
  if (!isOnline || (!hydrating && !error)) return null
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
        error
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-blue-100 bg-blue-50 text-blue-700',
        className
      )}
      data-testid="pos-sync-status"
    >
      <RefreshCw className={cn('h-4 w-4 shrink-0', hydrating && 'animate-spin')} />
      <span className="min-w-0 flex-1">
        {error || 'Sincronizando Terminal POS con el servidor…'}
      </span>
      {error && !hydrating && (
        <button
          type="button"
          onClick={() => onRetry?.().catch(() => null)}
          className="shrink-0 font-semibold text-red-700 underline underline-offset-2"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

