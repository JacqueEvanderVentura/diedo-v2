import { useMemo, useRef, useState } from 'react'

import { Download, Loader2, Upload } from 'lucide-react'

import { toast } from 'sonner'

import { Button } from '@/components/ui/Button'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { Modal } from '@/components/ui/Modal'
import { useConfigStore } from '@/stores/configStore'
import { importJobRunningKind, useImportJobStore } from '@/stores/importJobStore'
import {
  IMPORT_CSV_TEMPLATES,
} from '@/modules/configuracion/lib/csvImport'
import { isSettingsBlockVisible } from '@/modules/configuracion/lib/settingsSearch'
import { runImportJob } from '@/modules/configuracion/lib/runImportJob'
import { ImportProgressTicker } from '@/modules/configuracion/components/ImportProgressTicker'

const IMPORT_KINDS = ['pipeline', 'customers', 'activities', 'agenda']

function shouldShowBranchPicker(visibleBlockIds) {
  if (isSettingsBlockVisible(visibleBlockIds, 'branch')) return true
  return IMPORT_KINDS.some((kind) => isSettingsBlockVisible(visibleBlockIds, kind))
}

function downloadTemplate(name, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `helios-crm-import-${name}-plantilla.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function ImportCsvButton({ kind, running, onFile }) {
  const inputRef = useRef(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        disabled={Boolean(running)}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(kind, file)
        }}
        data-testid={`data-import-file-${kind}`}
      />
      <Button
        type="button"
        size="sm"
        disabled={Boolean(running)}
        variant="secondary"
        onClick={() => inputRef.current?.click()}
      >
        {running === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {running === kind ? 'Importando…' : 'Subir CSV'}
      </Button>
    </>
  )
}

function DetailLink({ count, label, onOpen, emptyText }) {
  if (!count) {
    return <span className="text-slate-600">{emptyText ?? `0 ${label}`}</span>
  }

  return (
    <button
      type="button"
      className="text-left text-slate-800 underline decoration-slate-400 underline-offset-2 hover:text-blue-600 hover:decoration-blue-400"
      onClick={onOpen}
    >
      {count} {label}
    </button>
  )
}

function ImportDetailRow({ row }) {
  const title = row.displayName?.trim()
    || (row.externalId ? `ID externo ${row.externalId}` : 'Fila sin identificar')

  const contactParts = [row.phone, row.email].filter(Boolean)

  const statusLabel = row.status === 'created'
    ? 'Nuevo'
    : row.status === 'updated'
      ? 'Actualizado'
      : row.status === 'skipped'
        ? 'Sin cambios'
        : row.status === 'error'
          ? 'Error'
          : null

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-slate-900">
          {title}
          {row.rowNumber ? <span className="font-normal text-slate-500"> · línea {row.rowNumber}</span> : null}
        </p>
        {statusLabel ? (
          <span className="shrink-0 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {statusLabel}
          </span>
        ) : null}
      </div>
      {contactParts.length > 0 ? (
        <p className="mt-1 text-slate-700">{contactParts.join(' · ')}</p>
      ) : null}
      {row.displayName && row.externalId ? (
        <p className="mt-1 text-xs text-slate-500">ID externo: {row.externalId}</p>
      ) : null}
      {row.status === 'updated' && row.message ? (
        <p className="mt-2 text-slate-800">
          <span className="font-medium text-emerald-800">Cambios: </span>
          {row.message}
        </p>
      ) : null}
      {row.status !== 'updated' && row.message ? (
        <p className="mt-2 text-slate-600">{row.message}</p>
      ) : null}
    </li>
  )
}

function ImportDetailModal({ open, onClose, title, rows }) {
  return (
    <Modal open={open} onClose={onClose} title={title} wide testId="data-import-detail-modal">
      <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-5 text-sm">
        {rows.length === 0 ? (
          <p className="text-slate-500">No hay registros en esta categoría.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row, index) => (
              <ImportDetailRow key={`${row.externalId || 'row'}-${index}`} row={row} />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

export default function DataImportPanel({ embedded = false, visibleBlockIds }) {
  const branches = useConfigStore((state) => state.branches)
  const [branchId, setBranchId] = useState('')
  const [detailModal, setDetailModal] = useState(null)
  const [pendingImport, setPendingImport] = useState(null)
  const [pendingBranchId, setPendingBranchId] = useState('')

  const jobStatus = useImportJobStore((s) => s.status)
  const jobKind = useImportJobStore((s) => s.kind)
  const progress = useImportJobStore((s) => s.progress)
  const tickerRows = useImportJobStore((s) => s.tickerRows)
  const report = useImportJobStore((s) => s.report)
  const running = importJobRunningKind({ status: jobStatus, kind: jobKind })

  const showBranchPicker = shouldShowBranchPicker(visibleBlockIds)

  const activeBranchId = useMemo(() => {
    if (branchId) return branchId
    if (branches.length === 1) return branches[0]?.id || ''
    return ''
  }, [branchId, branches])

  const resolveBranchId = () => {
    if (branchId) return branchId
    if (branches.length === 1) return branches[0]?.id || ''
    return ''
  }

  const detailRows = useMemo(() => {
    if (!report || !detailModal) return []
    if (detailModal === 'created') return report.rows.filter((row) => row.status === 'created')
    if (detailModal === 'updated') return report.rows.filter((row) => row.status === 'updated')
    if (detailModal === 'skipped') return report.rows.filter((row) => row.status === 'skipped')
    return report.rows.filter((row) => row.status === 'error')
  }, [report, detailModal])

  const startImport = (kind, file, targetBranchId) => {
    if (!file || !targetBranchId) {
      toast.error('Selecciona una sucursal antes de importar.')
      return
    }
    setDetailModal(null)
    const branchName = branches.find((branch) => branch.id === targetBranchId)?.name || null
    void runImportJob({ kind, file, targetBranchId, branchName })
  }

  const handleFile = (kind, file) => {
    if (!file) return
    const targetBranchId = resolveBranchId()
    if (!targetBranchId && branches.length > 1) {
      setPendingBranchId('')
      setPendingImport({ kind, file })
      return
    }
    startImport(kind, file, targetBranchId)
  }

  const confirmPendingImport = () => {
    if (!pendingImport || !pendingBranchId) {
      toast.error('Selecciona una sucursal antes de importar.')
      return
    }
    setBranchId(pendingBranchId)
    const { kind, file } = pendingImport
    setPendingImport(null)
    startImport(kind, file, pendingBranchId)
  }

  const showProgress = jobStatus === 'running' && progress

  return (
    <div className={embedded ? 'space-y-6' : 'mx-auto max-w-[900px] space-y-6 p-6'} data-testid="data-import-panel">
      {isSettingsBlockVisible(visibleBlockIds, 'import') && (
      <div>
        <h2 className="font-heading text-lg font-bold text-slate-900">Importar datos CRM</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sube los CSV según la plantilla. La importación usa tu sesión y la sucursal seleccionada.
        </p>
      </div>
      )}

      {showBranchPicker && (
      <div data-settings-block="datos:branch">
        <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal destino</label>
        <BranchMultiSelect
          branches={branches}
          branchIds={activeBranchId ? [activeBranchId] : []}
          onChange={(ids) => setBranchId(ids[0] || '')}
          selectionMode="single"
          showAllOption={false}
          className="w-full max-w-md"
          testId="data-import-branch"
        />
      </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {IMPORT_KINDS.filter((kind) => isSettingsBlockVisible(visibleBlockIds, kind)).map((kind) => (
          <div key={kind} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft" data-settings-block={`datos:${kind}`}>
            <h3 className="font-semibold capitalize text-slate-900">
              {kind === 'pipeline'
                ? 'Embudo (leads)'
                : kind === 'customers'
                  ? 'Clientes'
                  : kind === 'agenda'
                    ? 'Agenda (citas)'
                    : 'Actividades'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {kind === 'pipeline' && 'Crea lead + oportunidad para Standard y Simplificado.'}
              {kind === 'customers' && 'Directorio compartido (POS / Clientes). Se envían lotes de hasta 100 filas por solicitud.'}
              {kind === 'activities' && 'Tareas de seguimiento vinculadas por leadExternalId.'}
              {kind === 'agenda' && 'Importa citas al calendario. Importa Clientes primero; vinculación por teléfono y correo. Sin cabina en el CSV se asigna Cabina 1 (se crea solo si no hay ninguna). Si hay choques se usan otras cabinas o, en importación, se agrupan en el mismo horario. Lotes de hasta 100 filas.'}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => downloadTemplate(kind, IMPORT_CSV_TEMPLATES[kind])}
              >
                <Download className="h-4 w-4" />
                Plantilla
              </Button>
              <ImportCsvButton kind={kind} running={running} onFile={handleFile} />
            </div>
          </div>
        ))}
      </div>

      {showProgress && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4 text-sm" data-testid="data-import-progress">
          <p className="mb-3 font-medium text-blue-900" data-testid="data-import-roam-hint">
            Puedes continuar yendo a la app.
            <span className="mt-0.5 block text-xs font-normal text-blue-800/80">
              El progreso sigue visible arriba a la derecha en el encabezado.
            </span>
          </p>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-slate-700">
            <span>
              Lote {progress.batchIndex} de {progress.batchCount}
            </span>
            <span>
              {progress.processed} / {progress.total}
              {jobKind === 'agenda' ? ' citas' : ' filas'}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.round((progress.processed / progress.total) * 100))}%` }}
            />
          </div>
          {jobKind === 'agenda' && tickerRows.length > 0 ? (
            <ImportProgressTicker rows={tickerRows} />
          ) : null}
        </div>
      )}

      {report && jobStatus === 'done' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" data-testid="data-import-report">
          <p className="font-semibold text-slate-900">{report.headline}</p>
          <p className="mt-1 text-xs text-slate-500">
            Archivo: {report.totalInFile} filas · procesadas {report.processed}
            {report.branchName ? ` · sucursal: ${report.branchName}` : ''}
          </p>
          {report.agendaSummary ? (
            <p className="mt-2 text-xs text-slate-600">
              {report.agendaSummary.linked} vinculadas al directorio · {report.agendaSummary.unlinked} sin cliente (revisar nota en la cita)
            </p>
          ) : null}
          <ul className="mt-3 space-y-1.5 text-slate-800">
            <li>
              — <DetailLink count={report.summary.created || 0} label="importados correctamente" onOpen={() => setDetailModal('created')} />
            </li>
            <li>
              — <DetailLink
                count={report.summary.updated || 0}
                label="actualizados"
                emptyText="0 actualizados"
                onOpen={() => setDetailModal('updated')}
              />
            </li>
            <li>
              — <DetailLink count={report.summary.skipped || 0} label="duplicados (ya existían)" onOpen={() => setDetailModal('skipped')} />
            </li>
            <li>
              — <DetailLink
                count={report.summary.error || 0}
                label="inválidos o con error"
                emptyText="No hubo inválidos ni errores"
                onOpen={() => setDetailModal('error')}
              />
            </li>
          </ul>
        </div>
      )}

      <Modal
        open={Boolean(pendingImport)}
        onClose={() => setPendingImport(null)}
        title="Sucursal destino"
        testId="data-import-branch-modal"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Elige la sucursal a la que se asignarán los registros de este archivo antes de importar.
          </p>
          <BranchMultiSelect
            branches={branches}
            branchIds={pendingBranchId ? [pendingBranchId] : []}
            onChange={(ids) => setPendingBranchId(ids[0] || '')}
            selectionMode="single"
            showAllOption={false}
            className="w-full"
            testId="data-import-branch-modal-select"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPendingImport(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmPendingImport} disabled={!pendingBranchId}>
              Importar
            </Button>
          </div>
        </div>
      </Modal>

      <ImportDetailModal
        open={Boolean(detailModal)}
        onClose={() => setDetailModal(null)}
        title={
          detailModal === 'created'
            ? 'Importados correctamente'
            : detailModal === 'updated'
              ? 'Actualizados'
              : detailModal === 'skipped'
                ? 'Duplicados omitidos'
                : 'Inválidos o con error'
        }
        rows={detailRows}
      />
    </div>
  )
}
