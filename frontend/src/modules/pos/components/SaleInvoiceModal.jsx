import { Printer, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatDOP } from '@/lib/format'
import { buildInvoiceHtml, downloadInvoicePdf, invoiceFilename, printInvoice } from '../lib/invoice'

export function SaleInvoiceModal({ open, onClose, invoice }) {
  if (!invoice?.data) return null

  const { data } = invoice
  const html = invoice.html || buildInvoiceHtml(data)

  const handlePrint = () => {
    printInvoice(html)
    toast.success('Enviando a impresión…')
  }

  const handleDownload = async () => {
    try {
      await downloadInvoicePdf(data, invoiceFilename(data.id))
      toast.success('Factura descargada')
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar la factura.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Factura generada"
      testId="pos-sale-invoice-modal"
      xlarge
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <div>
            <p className="font-semibold text-emerald-900" data-testid="pos-invoice-id">{data.id}</p>
            <p className="text-sm text-emerald-800">{data.customerName} · {data.paymentMethod}</p>
          </div>
          <p className="font-heading text-xl font-bold text-emerald-700">{formatDOP(data.total)}</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1">
          <iframe
            title="Vista previa de factura"
            srcDoc={html}
            className="h-[min(58vh,500px)] w-full rounded-lg bg-white"
            data-testid="pos-invoice-preview"
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={handlePrint} data-testid="pos-invoice-print">
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="secondary" onClick={handleDownload} data-testid="pos-invoice-download">
            <Download className="h-4 w-4" /> Descargar PDF
          </Button>
          <Button className="ml-auto min-w-[120px]" onClick={onClose} data-testid="pos-invoice-close">
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
