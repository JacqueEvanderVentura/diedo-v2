import { toast } from 'sonner'

import { useImportJobStore } from '@/stores/importJobStore'
import { crmApi, createCrmIdempotencyKey } from '@/services/crmApi'
import { masterDataApi } from '@/services/masterDataApi'
import { appointmentsApi } from '@/services/appointmentsApi'
import {
  batchErrorResults,
  chunkRows,
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
import { computeTickerLimit, sequentialTickerRowsFromBatch } from '@/modules/configuracion/lib/importProgressTicker'

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

export async function runImportJob({ kind, file, targetBranchId, branchName }) {
  const store = useImportJobStore.getState()
  store.startJob(kind)

  try {
    const text = await file.text()
    const { headers, rows: parsed } = parseCsvWithHeaders(text)
    const templateCheck = validateImportTemplateHeaders(kind, headers)

    if (!templateCheck.ok) {
      toast.error(IMPORT_TEMPLATE_FORMAT_ERROR)
      store.cancelJob()
      return
    }

    if (!parsed.length) {
      toast.error('El archivo no contiene filas.')
      store.cancelJob()
      return
    }

    let items = []
    let preInvalid = []

    const batchProgress = (update) => {
      store.patchProgress(update)
    }

    if (kind === 'pipeline') {
      const { validRows, invalidRows } = preparePipelineRows(parsed)
      preInvalid = invalidRows
      items = await importBatches({
        rows: validRows,
        chunkSize: 100,
        onProgress: batchProgress,
        runBatch: (batch, index) => crmApi.importPipeline(
          { branchId: targetBranchId, items: batch },
          createCrmIdempotencyKey(`pipeline-${file.name}-${index}`),
        ),
      })
    } else if (kind === 'customers') {
      const { validRows, invalidRows } = prepareCustomerRows(parsed)
      preInvalid = invalidRows
      items = await importBatches({
        rows: validRows,
        chunkSize: 100,
        onProgress: batchProgress,
        runBatch: (batch, index) => masterDataApi.importCustomers(
          { branchIds: [targetBranchId], items: batch },
          createCrmIdempotencyKey(`customers-${file.name}-${index}`),
        ),
      })
    } else if (kind === 'agenda') {
      const { validRows, invalidRows } = prepareAgendaRows(parsed)
      preInvalid = invalidRows
      store.setAgendaTickerCap(computeTickerLimit(validRows.length))
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
        onProgress: batchProgress,
        runBatch: (batch, index) => crmApi.importActivities(
          { branchId: targetBranchId, items: batch },
          createCrmIdempotencyKey(`activities-${file.name}-${index}`),
        ),
      })
    }

    const allRows = [...preInvalid, ...items]
    const stats = summarizeImportResults(allRows, parsed.length)

    let agendaSummary = null
    if (kind === 'agenda') {
      const createdRows = allRows.filter((row) => row.status === 'created')
      agendaSummary = {
        linked: createdRows.filter((row) => row.customerLinked).length,
        unlinked: createdRows.filter((row) => !row.customerLinked).length,
      }
    }

    const report = {
      kind,
      branchName,
      ...stats,
      agendaSummary,
      rows: allRows,
    }

    store.finishJob({ report, headline: stats.headline })
    toast.success(stats.headline)
  } catch (error) {
    const message = error?.message || 'No se pudo importar el archivo.'
    store.failJob(message)
    toast.error(message)
  }
}
