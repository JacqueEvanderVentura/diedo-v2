import * as Icons from 'lucide-react'
import { Printer, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { fmtDateTime, METHOD_LABELS, METHOD_ICON } from '../lib/crm'
import { buildInvoiceDataFromSale, downloadSaleInvoicePdf, printSaleInvoice } from '../lib/sales'
import { cn } from '@/lib/utils'

function ItemPrice({ item }) {
  const unit = Number(item.price) || 0
  const list = Number(item.listPrice ?? item.price) || 0
  const discounted = unit < list - 0.001
  return (
    <span>
      {discounted && <span className="mr-1.5 text-slate-400 line-through">{formatDOP(list)}</span>}
      <span className={discounted ? 'font-semibold text-emerald-600' : ''}>{formatDOP(unit)}</span>
    </span>
  )
}

export function SaleDetailModal({ open, onClose, sale }) {
  const branches = useConfigStore((s) => s.branches)
  const settings = useConfigStore((s) => s.settings)
  const paymentMethods = useConfigStore((s) => s.paymentMethods)

  if (!sale) return null

  const branchName = branches.find((b) => b.id === sale.branchId)?.name || '—'
  const Icon = Icons[METHOD_ICON[sale.method]] || Icons.Circle
  const ctx = { branches, settings, paymentMethods }
  const invoice = buildInvoiceDataFromSale(sale, ctx)

  const print = () => {
    printSaleInvoice(sale, ctx)
    toast.success('Enviando a impresión…')
  }

  const download = () => {
    downloadSaleInvoicePdf(sale, ctx)
    toast.success('Factura descargada')
  }

  return (
    <Modal open={open} onClose={onClose} title="Detalle de venta" testId="sale-detail-modal" wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-slate-50 p-4">
          <div>
            <p className="font-heading text-lg font-bold text-slate-900" data-testid="sale-detail-id">{sale.id.toUpperCase()}</p>
            <p className="mt-1 text-sm text-slate-500">{fmtDateTime(sale.createdAt)} · {branchName}</p>
            <p className="mt-2 font-semibold text-slate-800">{sale.customer?.name || 'Cliente Mostrador'}</p>
          </div>
          <div className="text-right">
            <p className="font-heading text-2xl font-bold text-blue-600">{formatDOP(sale.total)}</p>
            <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600">
              <Icon className="h-4 w-4 text-slate-400" />
              {METHOD_LABELS[sale.method] || sale.method}
            </span>
            {sale.reference && <p className="mt-1 text-xs text-slate-400">Ref: {sale.reference}</p>}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">Artículo</th>
                <th className="px-4 py-3 text-center">Cant.</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{item.qty}</td>
                  <td className="px-4 py-3 text-right text-slate-600"><ItemPrice item={item} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatDOP(item.price * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={cn('ml-auto max-w-xs space-y-1.5 text-sm text-slate-600')}>
          <div className="flex justify-between"><span>Subtotal</span><span>{formatDOP(invoice.subtotal)}</span></div>
          {invoice.discountAmt > 0 && (
            <div className="flex justify-between text-emerald-600"><span>Descuento</span><span>-{formatDOP(invoice.discountAmt)}</span></div>
          )}
          <div className="flex justify-between"><span>ITBIS ({invoice.taxPct}%)</span><span>{formatDOP(invoice.taxAmt)}</span></div>
          <div className="flex justify-between border-t border-slate-100 pt-2 font-heading text-base font-bold text-slate-900">
            <span>Total</span><span>{formatDOP(invoice.total)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={print} data-testid="sale-detail-print">
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="secondary" onClick={download} data-testid="sale-detail-download">
            <Download className="h-4 w-4" /> Descargar PDF
          </Button>
        </div>
      </div>
    </Modal>
  )
}
