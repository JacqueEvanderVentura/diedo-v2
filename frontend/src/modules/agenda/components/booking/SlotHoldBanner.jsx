import { Clock, X } from 'lucide-react'
import { formatHoldCountdown } from '@/modules/agenda/lib/slotHoldCountdown'
import { cn } from '@/lib/utils'

export function SlotHoldBanner({
  expiresAt,
  nowMs,
  onDismiss,
  className,
  testId = 'slot-hold-banner',
}) {
  if (!expiresAt) return null
  const countdown = formatHoldCountdown(expiresAt, nowMs)
  if (countdown === '0:00') return null

  return (
    <div
      role="status"
      data-testid={testId}
      className={cn(
        'relative flex gap-3 rounded-r-xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-4 text-sm text-orange-950',
        className,
      )}
    >
      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 pr-6">
        <p className="font-semibold text-orange-900">
          Aún no has confirmado este espacio, lo hemos bloqueado para ti por 10 minutos
        </p>
        <p className="text-orange-900/90">
          Te quedan{' '}
          <span className="font-bold tabular-nums text-red-600" data-testid={`${testId}-countdown`}>
            {countdown}
          </span>{' '}
          para confirmar antes de que se libere.
        </p>
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Cerrar aviso"
          className="absolute right-2 top-2 rounded-lg p-1 text-orange-600 hover:bg-orange-100"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}