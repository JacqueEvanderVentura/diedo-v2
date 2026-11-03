import { useMemo, useRef, useState } from 'react'

import { Download, Loader2, Upload } from 'lucide-react'

import { toast } from 'sonner'



import { Button } from '@/components/ui/Button'

import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'

import { Modal } from '@/components/ui/Modal'

import { useConfigStore } from '@/stores/configStore'

import { crmApi, createCrmIdempotencyKey } from '@/services/crmApi'

import { masterDataApi } from '@/services/masterDataApi'

import { appointmentsApi } from '@/services/appointmentsApi'

import {

  batchErrorResults,

  chunkRows,

  IMPORT_CSV_TEMPLATES,

  IMPORT_TEMPLATE_FORMAT_ERROR,

  mapCsvRowToApi,

  parseCsvWithHeaders,

  prepareActivityRows,

  prepareAgendaRows,

  prepareCustomerRows,

  toPipelineImportItem,

  validateImportTemplateHeaders,

  validatePipelineRow,

} from '@/modules/configuracion/lib/csvImport'
import { isSettingsBlockVisible } from '@/modules/configuracion/lib/settingsSearch'
import {
  appendTickerRowsCapped,
  computeTickerLimit,
  sequentialTickerRowsFromBatch,
} from '@/modules/configuracion/lib/importProgressTicker'
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



function normalizeResultRow(row, sourceRow = null) {

  const displayName = row.displayName
    ?? row.display_name
    ?? row.customerName
    ?? row.customer_name
    ?? sourceRow?.displayName
    ?? sourceRow?.customerName
    ?? null

  const phone = row.phone ?? row.customerPhone ?? sourceRow?.phone ?? sourceRow?.customerPhone ?? null

  const email = row.email ?? sourceRow?.email ?? null

  return {

    externalId: row.externalId ?? row.external_id ?? null,

    appointmentId: row.appointmentId ?? row.appointment_id ?? null,

    status: row.status,

    message: row.message ?? null,

    rowNumber: row.rowNumber ?? null,

    displayName,

    phone,

    email,

    customerLinked: row.customerLinked ?? row.customer_linked ?? null,

    date: row.date ?? null,

    time: row.time ?? null,

    serviceName: row.serviceName ?? row.service_name ?? null,

  }

}



function summarizeImportResults(rows, totalInFile) {

  const summary = rows.reduce(

    (acc, row) => {

      acc[row.status] = (acc[row.status] || 0) + 1

      return acc

    },

    { created: 0, updated: 0, skipped: 0, error: 0 },

  )

  const processed = rows.length

  const importedOk = summary.created || 0

  const updatedCount = summary.updated || 0

  const headlineParts = [`${importedOk}/${totalInFile} importados al sistema`]

  if (updatedCount > 0) {

    headlineParts.push(`${updatedCount} de ${totalInFile} actualizados`)

  }

  return {

    summary,

    totalInFile,

    processed,

    headline: headlineParts.join(', '),

  }

}



async function importBatches({ rows, chunkSize, runBatch, onProgress }) {

  const chunks = chunkRows(rows, chunkSize)

  const allResults = []

  for (let index = 0; index < chunks.length; index += 1) {

    const batch = chunks[index]

    try {

      const response = await runBatch(batch, index)

      const batchResults = (response.items || []).map((item, rowIndex) => normalizeResultRow(item, batch[rowIndex]))

      allResults.push(...batchResults)

      if (onProgress) {
        const tickerSample = sequentialTickerRowsFromBatch(batchResults)
        onProgress({
          processed: allResults.length,
          total: rows.length,
          batchIndex: index + 1,
          batchCount: chunks.length,
          tickerSample,
        })
      }

    } catch (error) {

      allResults.push(...batchErrorResults(batch, index, chunkSize, error))

      if (onProgress) {
        onProgress({
          processed: allResults.length,
          total: rows.length,
          batchIndex: index + 1,
          batchCount: chunks.length,
          tickerSample: [],
        })
      }

    }

  }

  return allResults

}



function preparePipelineRows(parsedRows) {

  const validRows = []

  const invalidRows = []

  parsedRows.forEach((row, index) => {

    const mapped = toPipelineImportItem(mapCsvRowToApi(row))

    const validationError = validatePipelineRow(row, mapped)

    if (validationError) {

      invalidRows.push({

        externalId: row.externalId || null,

        status: 'error',

        message: validationError,

        rowNumber: index + 2,

      })

      return

    }

    validRows.push(mapped)

  })

  return { validRows, invalidRows }

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

  const [running, setRunning] = useState(null)

  const [report, setReport] = useState(null)

  const [detailModal, setDetailModal] = useState(null)

  const [pendingImport, setPendingImport] = useState(null)

  const [pendingBranchId, setPendingBranchId] = useState('')

  const [progress, setProgress] = useState(null)

  const [tickerRows, setTickerRows] = useState([])

  const agendaTickerCapRef = useRef(0)

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



  const runImport = async (kind, file, targetBranchId) => {
    if (!file || !targetBranchId) {
      toast.error('Selecciona una sucursal antes de importar.')
      return
    }

    setRunning(kind)

    setReport(null)

    setDetailModal(null)

    setProgress(null)

    setTickerRows([])
    agendaTickerCapRef.current = 0

    try {

      const text = await file.text()

      const { headers, rows: parsed } = parseCsvWithHeaders(text)

      const templateCheck = validateImportTemplateHeaders(kind, headers)

      if (!templateCheck.ok) {

        toast.error(IMPORT_TEMPLATE_FORMAT_ERROR)

        return

      }

      if (!parsed.length) {

        toast.error('El archivo no contiene filas.')

        return

      }



      let items = []

      let preInvalid = []

      const batchProgress = (update) => {
        setProgress(update)
        if (update.tickerSample?.length && agendaTickerCapRef.current > 0) {
          setTickerRows((prev) => appendTickerRowsCapped(
            prev,
            update.tickerSample,
            agendaTickerCapRef.current,
          ))
        }
      }



      if (kind === 'pipeline') {

        const { validRows, invalidRows } = preparePipelineRows(parsed)

        preInvalid = invalidRows

        items = await importBatches({

          rows: validRows,

          chunkSize: 100,

          runBatch: (batch, index) => crmApi.importPipeline(

            {

              branchId: targetBranchId,

              items: batch,

            },

            createCrmIdempotencyKey(`pipeline-${file.name}-${index}`),

          ),

        })

      } else if (kind === 'customers') {

        const { validRows, invalidRows } = prepareCustomerRows(parsed)

        preInvalid = invalidRows

        items = await importBatches({

          rows: validRows,

          chunkSize: 100,

          runBatch: (batch, index) => masterDataApi.importCustomers(

            { branchIds: [targetBranchId], items: batch },

            createCrmIdempotencyKey(`customers-${file.name}-${index}`),

          ),

        })

      } else if (kind === 'agenda') {

        const { validRows, invalidRows } = prepareAgendaRows(parsed)

        preInvalid = invalidRows

        agendaTickerCapRef.current = computeTickerLimit(validRows.length)

        items = await importBatches({

          rows: validRows,

          chunkSize: 100,

          onProgress: batchProgress,

          runBatch: (batch, index) => appointmentsApi.importAppointments(

            { branchId: targetBranchId, items: batch },

            createCrmIdempotencyKey(`agenda-${file.name}-${index}`),

          ),

        })

      } else {

        const mapped = prepareActivityRows(parsed)

        items = await importBatches({

          rows: mapped,

          chunkSize: 100,

          runBatch: (batch, index) => crmApi.importActivities(

            { branchId: targetBranchId, items: batch },

            createCrmIdempotencyKey(`activities-${file.name}-${index}`),

          ),

        })

      }



      const allRows = [...preInvalid, ...items]

      const stats = summarizeImportResults(allRows, parsed.length)

      const branchName = branches.find((branch) => branch.id === targetBranchId)?.name || null

      let agendaSummary = null

      if (kind === 'agenda') {

        const createdRows = allRows.filter((row) => row.status === 'created')

        agendaSummary = {

          linked: createdRows.filter((row) => row.customerLinked).length,

          unlinked: createdRows.filter((row) => !row.customerLinked).length,

        }

      }

      setReport({

        kind,

        branchName,

        ...stats,

        agendaSummary,

        rows: allRows,

      })

      toast.success(stats.headline)

    } catch (error) {

      toast.error(error.message || 'No se pudo importar el archivo.')

    } finally {

      setRunning(null)

      setProgress(null)

      setTickerRows([])
      agendaTickerCapRef.current = 0

    }

  }

  const handleFile = async (kind, file) => {
    if (!file) return
    const targetBranchId = resolveBranchId()
    if (!targetBranchId && branches.length > 1) {
      setPendingBranchId('')
      setPendingImport({ kind, file })
      return
    }
    await runImport(kind, file, targetBranchId)
  }

  const confirmPendingImport = async () => {
    if (!pendingImport || !pendingBranchId) {
      toast.error('Selecciona una sucursal antes de importar.')
      return
    }
    setBranchId(pendingBranchId)
    const { kind, file } = pendingImport
    setPendingImport(null)
    await runImport(kind, file, pendingBranchId)
  }



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



      {progress && running === 'agenda' && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4 text-sm" data-testid="data-import-progress">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-slate-700">
            <span>
              Lote {progress.batchIndex} de {progress.batchCount}
            </span>
            <span>
              {progress.processed} / {progress.total} citas
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.round((progress.processed / progress.total) * 100))}%` }}
            />
          </div>
          {tickerRows.length > 0 ? <ImportProgressTicker rows={tickerRows} /> : null}
        </div>
      )}



      {report && (

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


