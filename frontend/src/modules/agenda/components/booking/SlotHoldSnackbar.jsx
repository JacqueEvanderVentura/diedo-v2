import { Clock, X } from 'lucide-react'
import { formatHoldCountdown } from '@/modules/agenda/lib/slotHoldCountdown'
import { cn } from '@/lib/utils'

export function SlotHoldSnackbar({
  variant = 'held',
  expiresAt,
  nowMs,
  onClose,
  className,
  testId = 'slot-hold-snackbar',
}) {
  if (variant === 'formalized') {
    return (
      <motion
        role="alert"
        data-testid={testId}
        className={cn(
          'sticky top-2 z-20 flex gap-3 rounded-r-xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-4 text-sm shadow-md',
          className,
        )}
      >
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" aria-hidden />
        <p className="flex-1 font-medium text-orange-950">
          Oops! La persona agendando este espacio lo ha formalizado, favor de seleccionar otro horario
        </p>
        {onClose ? (
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-orange-600">
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </motion>
    )
  }

  const countdown = expiresAt ? formatHoldCountdown(expiresAt, nowMs) : '—'

  return (
    <motion
      role="status"
      data-testid={testId}
      className={cn(
        'sticky top-2 z-20 flex gap-3 rounded-r-xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-4 text-sm shadow-md',
        className,
      )}
    >
      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" aria-hidden />
      <p className="flex-1 text-orange-950">
        Este espacio está siendo apartado para otra persona, pero descuida, en{' '}
        <span className="font-bold tabular-nums text-red-600">{countdown}</span> se liberará si la
        persona no lo agenda.
      </p>
      {onClose ? (
        <button type="button" aria-label="Cerrar" onClick={onClose} className="text-orange-600">
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </motion>
  )
}

function motion({ children, ...props }) {
  return <div {...props}>{children}</div>
}