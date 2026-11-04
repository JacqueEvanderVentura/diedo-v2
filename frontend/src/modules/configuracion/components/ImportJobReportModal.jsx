import { useMemo, useState } from 'react'

import { Loader2 } from 'lucide-react'

import { Modal } from '@/components/ui/Modal'
import { IMPORT_KIND_LABELS } from '@/stores/importJobStore'

import {
  ImportDetailModal,
  ImportJobReportSummary,
  filterImportDetailRows,
  importDetailModalTitle,
} from '@/modules/configuracion/components/ImportJobReportUi'

export function ImportJobReportModal({
  open,
  onClose,
  status,
  kind,
  progress,
  report,
  headline,
  errorMessage,
}) {
  const [detailModal, setDetailModal] = useState(null)

  const detailRows = useMemo(
    () => filterImportDetailRows(report, detailModal),
    [report, detailModal],
  )

  const title = status === 'running'
    ? (IMPORT_KIND_LABELS[kind] || 'Importando')
    : status === 'done'
      ? 'Resumen de importación'
      : 'Error al importar'

  const percent = progress?.total
    ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
    : status === 'done'
      ? 100
      : 0

  return (
    <>
      <Modal open={open} onClose={onClose} title={title} wide testId="import-job-report-modal">
        <div className="space-y-4 p-5 text-sm">
          {status === 'running' && progress ? (
            <>
              <p className="text-slate-600">
                Lote {progress.batchIndex} de {progress.batchCount} · {progress.processed} / {progress.total} filas
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                <div
                  className="flex h-full items-center justify-end rounded-full bg-blue-600 pr-1 transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                >
                  {percent >= 12 ? (
                    <Loader2 className="h-3 w-3 animate-spin text-white" aria-hidden />
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-slate-500">Puedes seguir usando la app; el aviso del encabezado se actualiza solo.</p>
            </>
          ) : null}

          {status === 'error' ? (
            <p className="text-red-700">{errorMessage || 'No se pudo completar la importación.'}</p>
          ) : null}

          {status === 'done' && report ? (
            <ImportJobReportSummary report={report} onOpenDetail={setDetailModal} />
          ) : null}

          {status === 'done' && !report && headline ? (
            <p className="text-slate-700">{headline}</p>
          ) : null}
        </div>
      </Modal>

      <ImportDetailModal
        open={Boolean(detailModal)}
        onClose={() => setDetailModal(null)}
        title={importDetailModalTitle(detailModal, report)}
        rows={detailRows}
      />
    </>
  )
}
