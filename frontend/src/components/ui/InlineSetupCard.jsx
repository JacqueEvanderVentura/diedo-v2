import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * Bloqueo de flujo con salida inmediata: nunca solo toast.
 */
export function InlineSetupCard({
  title,
  message,
  actionLabel,
  actionHref,
  onAction,
  testId = 'inline-setup-card',
}) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      data-testid={testId}
    >
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          {title && <p className="font-semibold text-amber-950">{title}</p>}
          {message && <p className="text-amber-900/90">{message}</p>}
          {(actionHref || onAction) && actionLabel && (
            actionHref ? (
              <Link
                to={actionHref}
                data-testid={`${testId}-action`}
                className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-amber-50"
              >
                {actionLabel}
              </Link>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border-amber-300 bg-white"
                onClick={onAction}
                data-testid={`${testId}-action`}
              >
                {actionLabel}
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
