import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { IMPORT_KIND_LABELS, useImportJobStore } from '@/stores/importJobStore'

const SETTINGS_DATOS_LINK = '/configuracion?open=datos'

function progressPercent(progress) {
  if (!progress?.total) return 0
  return Math.min(100, Math.round((progress.processed / progress.total) * 100))
}

export function ImportJobBanner({ className }) {
  const status = useImportJobStore((s) => s.status)
  const kind = useImportJobStore((s) => s.kind)
  const progress = useImportJobStore((s) => s.progress)
  const headline = useImportJobStore((s) => s.headline)
  const errorMessage = useImportJobStore((s) => s.errorMessage)

  if (status === 'idle' || !kind) return null

  const isRunning = status === 'running'
  const isDone = status === 'done'
  const isError = status === 'error'

  const label = isRunning
    ? (IMPORT_KIND_LABELS[kind] || 'Importando')
    : isDone
      ? 'Importación lista'
      : 'Error al importar'

  const subline = isRunning && progress
    ? `${progress.processed} / ${progress.total}`
    : isDone
      ? (headline || 'Revisa el resumen en Configuración')
      : (errorMessage || 'Revisa el archivo')

  const percent = isRunning ? progressPercent(progress) : isDone ? 100 : 0

  return (
    <Link
      to={SETTINGS_DATOS_LINK}
      data-testid="import-job-banner"
      className={cn(
        'flex min-w-0 max-w-[min(100%,14rem)] flex-col gap-1 rounded-xl border px-3 py-2 text-left shadow-sm transition-colors sm:max-w-xs',
        isRunning && 'border-blue-200 bg-blue-50/90 hover:bg-blue-50',
        isDone && 'border-emerald-200 bg-emerald-50/90 hover:bg-emerald-50',
        isError && 'border-red-200 bg-red-50/90 hover:bg-red-50',
        className,
      )}
      title="Ir a importación de datos"
    >
      <div className="flex min-w-0 items-center gap-2">
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" aria-hidden />
        ) : isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden />
        )}
        <span className="truncate text-xs font-semibold text-slate-800">{label}</span>
      </div>
      <p className="truncate text-[10px] text-slate-600">{subline}</p>
      {isRunning || isDone ? (
        <div className="h-1 overflow-hidden rounded-full bg-white/80" aria-hidden>
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              isDone ? 'bg-emerald-500' : 'bg-blue-600',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </Link>
  )
}
