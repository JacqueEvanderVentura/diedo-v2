import { openHtmlInNewTab, printHtml, printPdfBlob, savePdfBlob } from '@/lib/print'
import { crmApi } from '@/services/crmApi'
import { documentsApi } from '@/services/documentsApi'
import { posApi } from '@/services/posApi'
import { useSessionStore } from '@/stores/sessionStore'
import { buildInvoiceHtml } from './invoice'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MIN_USABLE_PDF_BYTES = 200

export function isPersistedEntityId(id) {
  return UUID_RE.test(String(id || ''))
}

export function isUsableInvoicePdfBlob(blob) {
  if (!(blob instanceof Blob)) return false
  if (blob.size <= MIN_USABLE_PDF_BYTES) return false
  const type = (blob.type || '').toLowerCase()
  if (!type || type === 'application/pdf' || type === 'application/octet-stream') return true
  return false
}

async function fetchInvoicePdfBlob(data, { saleId, quoteId } = {}) {
  if (useSessionStore.getState().status !== 'online') {
    return null
  }
  try {
    let blob
    if (saleId && isPersistedEntityId(saleId)) {
      blob = await posApi.downloadSaleInvoicePdf(saleId)
    } else if (quoteId && isPersistedEntityId(quoteId)) {
      blob = await crmApi.downloadQuoteDocumentPdf(quoteId)
    } else {
      blob = await documentsApi.renderInvoicePdf(data)
    }
    return isUsableInvoicePdfBlob(blob) ? blob : null
  } catch {
    return null
  }
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
  openHtmlInNewTab(buildInvoiceHtml(data))
}
