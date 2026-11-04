import { useMemo, useRef, useState } from 'react'

import { Download, Loader2, Upload } from 'lucide-react'

import { toast } from 'sonner'

import { Button } from '@/components/ui/Button'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { Modal } from '@/components/ui/Modal'
import { useConfigStore } from '@/stores/configStore'
import { importJobRunningKind, useImportJobStore } from '@/stores/importJobStore'
import {
  downloadImportExcelTemplate,
  getImportKindTitle,
  getImportTemplateModalParagraphs,
  IMPORT_TEMPLATE_MODAL_INTRO,
  IMPORT_KIND_SUMMARY,
} from '@/modules/configuracion/lib/importExcelTemplates'
import { isSettingsBlockVisible } from '@/modules/configuracion/lib/settingsSearch'
import { runImportJob } from '@/modules/configuracion/lib/runImportJob'
import { ImportProgressTicker } from '@/modules/configuracion/components/ImportProgressTicker'
import {
  ImportDetailModal,
  ImportJobReportSummary,
  filterImportDetailRows,
  importDetailModalTitle,
} from '@/modules/configuracion/components/ImportJobReportUi'

const IMPORT_KINDS = ['pipeline', 'agenda', 'customers', 'activities']

function shouldShowBranchPicker(visibleBlockIds) {
  if (isSettingsBlockVisible(visibleBlockIds, 'branch')) return true
  return IMPORT_KINDS.some((kind) => isSettingsBlockVisible(visibleBlockIds, kind))
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

export default function DataImportPanel({ embedded = false, visibleBlockIds }) {
  const branches = useConfigStore((state) => state.branches)
  const [branchId, setBranchId] = useState('')
  const [detailModal, setDetailModal] = useState(null)
  const [pendingImport, setPendingImport] = useState(null)
  const [pendingBranchId, setPendingBranchId] = useState('')
  const [pendingAgendaChoice, setPendingAgendaChoice] = useState(null)
  const [templateModalKind, setTemplateModalKind] = useState(null)

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

  const detailRows = useMemo(
    () => filterImportDetailRows(report, detailModal),
    [report, detailModal],
  )

  const startImport = (kind, file, targetBranchId, options = {}) => {
    if (!file || !targetBranchId) {
      toast.error('Selecciona una sucursal antes de importar.')
      return
    }
    setDetailModal(null)
    const branchName = branches.find((branch) => branch.id === targetBranchId)?.name || null
    void runImportJob({
      kind,
      file,
      targetBranchId,
      branchName,
      syncCustomers: kind === 'agenda' ? Boolean(options.syncCustomers) : false,
    })
  }

  const beginImportForFile = (kind, file, targetBranchId) => {
    if (kind === 'agenda') {
      setPendingAgendaChoice({ file, targetBranchId })
      return
    }
    startImport(kind, file, targetBranchId)
  }

  const handleFile = (kind, file) => {
    if (!file) return
    const targetBranchId = resolveBranchId()
    if (!targetBranchId && branches.length > 1) {
      setPendingBranchId('')
      setPendingImport({ kind, file })
      return
    }
    beginImportForFile(kind, file, targetBranchId)
  }

  const confirmPendingImport = () => {
    if (!pendingImport || !pendingBranchId) {
      toast.error('Selecciona una sucursal antes de importar.')
      return
    }
    setBranchId(pendingBranchId)
    const { kind, file } = pendingImport
    setPendingImport(null)
    beginImportForFile(kind, file, pendingBranchId)
  }

  const confirmAgendaImport = (syncCustomers) => {
    if (!pendingAgendaChoice) return
    const { file, targetBranchId } = pendingAgendaChoice
    setPendingAgendaChoice(null)
    startImport('agenda', file, targetBranchId, { syncCustomers })
  }

  const confirmTemplateDownload = () => {
    if (!templateModalKind) return
    void downloadImportExcelTemplate(templateModalKind)
    setTemplateModalKind(null)
  }

  const showProgress = jobStatus === 'running' && progress

  return (
    <div className={embedded ? 'space-y-6' : 'mx-auto max-w-[900px] space-y-6 p-6'} data-testid="data-import-panel">
      {isSettingsBlockVisible(visibleBlockIds, 'import') && (
      <div>
        <h2 className="font-heading text-lg font-bold text-slate-900">Importar datos CRM</h2>
        <p className="mt-1 text-sm text-slate-500">
          Descarga plantillas Excel (.xlsx), complétalas y guárdalas como CSV UTF-8 para subir. La importación usa tu sesión y la sucursal seleccionada.
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
              {getImportKindTitle(kind)}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {IMPORT_KIND_SUMMARY[kind]}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTemplateModalKind(kind)}
                data-testid={`data-import-template-open-${kind}`}
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
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid="data-import-report">
          <ImportJobReportSummary report={report} onOpenDetail={setDetailModal} />
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

      <Modal
        open={Boolean(pendingAgendaChoice)}
        onClose={() => setPendingAgendaChoice(null)}
        title="Importar agenda"
        testId="data-import-agenda-sync-modal"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            ¿Qué deseas hacer con los clientes de este archivo?
          </p>
          <p className="text-xs text-slate-500">
            documentType y documentId son opcionales; si no hay documento, al elegir
            &quot;También agregar y fusionar clientes&quot; se comparará por teléfono y correo.
            La plantilla Excel incluye la columna Document Type con lista (cedula, pasaporte, otro).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => confirmAgendaImport(false)}
              data-testid="data-import-agenda-appointments-only"
            >
              Solo importar citas
            </Button>
            <Button
              type="button"
              onClick={() => confirmAgendaImport(true)}
              data-testid="data-import-agenda-sync-customers"
            >
              También agregar y fusionar clientes
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(templateModalKind)}
        onClose={() => setTemplateModalKind(null)}
        title={templateModalKind ? `Plantilla - ${getImportKindTitle(templateModalKind)}` : 'Plantilla'}
        testId="data-import-template-modal"
      >
        {templateModalKind ? (
          <div className="space-y-4 p-5 text-sm">
            <div className="space-y-3 leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-800">{IMPORT_TEMPLATE_MODAL_INTRO}</p>
              {getImportTemplateModalParagraphs(templateModalKind).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="secondary" onClick={() => setTemplateModalKind(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={confirmTemplateDownload}
                data-testid="data-import-template-download"
              >
                <Download className="h-4 w-4" />
                Descargar Excel
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ImportDetailModal
        open={Boolean(detailModal)}
        onClose={() => setDetailModal(null)}
        title={importDetailModalTitle(detailModal, report)}
        rows={detailRows}
      />
    </div>
  )
}
