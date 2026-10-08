import { downloadHtmlAsPdf, printHtml, printPdfBlob, savePdfBlob } from '@/lib/print'
import { crmApi } from '@/services/crmApi'
import { documentsApi } from '@/services/documentsApi'
import { posApi } from '@/services/posApi'
import { useSessionStore } from '@/stores/sessionStore'
import { buildInvoiceHtml } from './invoice'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPersistedEntityId(id) {
  return UUID_RE.test(String(id || ''))
}

async function fetchInvoicePdfBlob(data, { saleId, quoteId } = {}) {
  if (useSessionStore.getState().status !== 'online') {
    return null
  }
  if (saleId && isPersistedEntityId(saleId)) {
    return posApi.downloadSaleInvoicePdf(saleId)
  }
  if (quoteId && isPersistedEntityId(quoteId)) {
    return crmApi.downloadQuoteDocumentPdf(quoteId)
  }
  return documentsApi.renderInvoicePdf(data)
}

export async function printInvoiceDocument(data, options = {}) {
  const blob = await fetchInvoicePdfBlob(data, options)
  if (blob) {
    await printPdfBlob(blob)
    return
  }
  printHtml(buildInvoiceHtml(data))
}

export async function downloadInvoiceDocument(data, filename, options = {}) {
  const blob = await fetchInvoicePdfBlob(data, options)
  if (blob) {
    savePdfBlob(blob, filename)
    return
  }
  await downloadHtmlAsPdf(buildInvoiceHtml(data), filename)
}
