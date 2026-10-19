import { useState } from 'react'
import { Download, Printer, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useCrmStore } from '@/stores/crmStore'
import { downloadQuotePdf, printQuoteDocument, printSaleInvoice } from '@/modules/crm/lib/sales'
import { isDiscardedCrmQuote } from '@/modules/crm/lib/crmQuoteVisibility'
import { isQuoteInvoiced, quoteConvertedSaleId } from '@/modules/crm/lib/quoteInvoice'

export function SimplifiedLeadQuoteTimelineActions({ quote, documentCtx }) {
  const ensureQuoteDetail = useCrmStore((state) => state.ensureQuoteDetail)
  const ensureSaleDetail = useCrmStore((state) => state.ensureSaleDetail)
  const sales = useCrmStore((state) => state.sales)
  const [busy, setBusy] = useState(null)

  if (!quote?.id || !documentCtx || isDiscardedCrmQuote(quote)) return null

  const invoiced = isQuoteInvoiced(quote)
  const saleId = quoteConvertedSaleId(quote, sales)

  const resolveQuote = async () => {
    const detail = await ensureQuoteDetail(quote.id)
    return detail || quote
  }

  const run = async (key, action) => {
    setBusy(key)
    try {
      await action()
    } catch (error) {
      toast.error(error.message || 'No se pudo completar la acción')
    } finally {
      setBusy(null)
    }
  }

  const handlePrintQuote = () => run('print-quote', async () => {
    const detail = await resolveQuote()
    await printQuoteDocument(detail, documentCtx)
    toast.success('Enviando cotización a impresión…')
  })

  const handleDownloadQuote = () => run('download-quote', async () => {
    const detail = await resolveQuote()
    if (!detail?.id) {
      toast.error('La cotización ya no existe o fue eliminada.')
      return
    }
    await downloadQuotePdf(detail, documentCtx)
    toast.success('Cotización descargada')
  })

  const handlePrintInvoice = () => run('print-invoice', async () => {
    if (!saleId) {
      toast.error('No hay factura vinculada a esta cotización')
      return
    }
    const sale = await ensureSaleDetail(saleId)
    if (!sale) {
      toast.error('No se pudo cargar la factura')
      return
    }
    await printSaleInvoice(sale, documentCtx)
    toast.success('Enviando factura a impresión…')
  })

  return (
    <div className="mt-2 flex flex-wrap gap-2" data-testid={`crm-simplified-quote-actions-${quote.id}`}>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={Boolean(busy)}
        onClick={handlePrintQuote}
        data-testid={`crm-simplified-quote-print-${quote.id}`}
      >
        <Printer className="h-3.5 w-3.5" />
        {invoiced ? 'Imprimir cotización' : 'Imprimir'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={Boolean(busy)}
        onClick={handleDownloadQuote}
        data-testid={`crm-simplified-quote-download-${quote.id}`}
      >
        <Download className="h-3.5 w-3.5" />
        PDF
      </Button>
      {invoiced && saleId ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={handlePrintInvoice}
          data-testid={`crm-simplified-quote-invoice-print-${quote.id}`}
        >
          <Receipt className="h-3.5 w-3.5" />
          Imprimir factura
        </Button>
      ) : null}
    </div>
  )
}
