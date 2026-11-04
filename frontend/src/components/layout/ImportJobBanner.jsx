import { useState } from 'react'

import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ImportJobReportModal } from '@/modules/configuracion/components/ImportJobReportModal'
import { IMPORT_KIND_LABELS, useImportJobStore } from '@/stores/importJobStore'

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
  const report = useImportJobStore((s) => s.report)
  const bannerDismissed = useImportJobStore((s) => s.bannerDismissed)
  const dismissBanner = useImportJobStore((s) => s.dismissBanner)

  const [modalOpen, setModalOpen] = useState(false)

  if (status === 'idle' || !kind) return null
  if (bannerDismissed && status !== 'running') return null

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
      ? (headline || 'Toca para ver el detalle')
      : (errorMessage || 'Toca para ver el detalle')

  const percent = isRunning ? progressPercent(progress) : isDone ? 100 : 0

  return (
    <>
      <div
        data-testid="import-job-banner"
        className={cn(
          'relative flex min-w-0 max-w-[min(100%,14rem)] flex-col gap-1 rounded-xl border px-3 py-2 pr-8 text-left shadow-sm transition-colors sm:max-w-xs',
          isRunning && 'border-blue-200 bg-blue-50/90',
          isDone && 'border-emerald-200 bg-emerald-50/90',
          isError && 'border-red-200 bg-red-50/90',
          className,
        )}
      >
        <button
          type="button"
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-white/80 hover:text-slate-700"
          aria-label="Quitar aviso del encabezado"
          data-testid="import-job-banner-dismiss"
          onClick={(event) => {
            event.stopPropagation()
            dismissBanner()
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="min-w-0 text-left"
          title="Ver resumen de importación"
          onClick={() => setModalOpen(true)}
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
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/80" aria-hidden>
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300',
                  isDone ? 'bg-emerald-500' : 'bg-blue-600',
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </button>
      </div>

      <ImportJobReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        status={status}
        kind={kind}
        progress={progress}
        report={report}
        headline={headline}
        errorMessage={errorMessage}
      />
    </>
  )
}
