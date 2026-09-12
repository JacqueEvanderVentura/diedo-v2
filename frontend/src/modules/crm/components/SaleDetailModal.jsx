import { useEffect, useMemo, useState } from 'react'
import * as Icons from 'lucide-react'
import { Printer, Download, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { useCrmStore } from '@/stores/crmStore'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'
import { PermissionElevationModal } from '@/components/auth/PermissionElevationModal'
import { formatDOP } from '@/lib/format'
import { fmtDateTime, METHOD_LABELS, METHOD_ICON } from '../lib/crm'
import { buildInvoiceDataFromSale, downloadSaleInvoicePdf, printSaleInvoice } from '../lib/sales'
import { cn } from '@/lib/utils'

const VOID_INVOICE_PERMISSION = 'sales.invoice.void'

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
  const customers = useCustomersStore((s) => s.customers)
  const ensureSaleDetail = useCrmStore((s) => s.ensureSaleDetail)
  const voidSale = usePosStore((s) => s.voidSale)
  const mutating = usePosStore((s) => s.mutating)
  const canVoidInvoice = useSessionStore((s) => s.hasPermission(VOID_INVOICE_PERMISSION))
  const isOnline = useSessionStore((s) => s.status === 'online')
  const [detail, setDetail] = useState(sale)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [elevationOpen, setElevationOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError] = useState('')

  useEffect(() => {
    if (!open || !sale) {
      setDetail(null)
      return
    }
    setDetail(sale)
    if (!isOnline || sale.detailLoaded || sale.items?.length) return
    setLoadingDetail(true)
    ensureSaleDetail(sale.id)
      .then((loaded) => {
        if (loaded) setDetail(loaded)
      })
      .catch(() => toast.error('No se pudo cargar el detalle de la venta'))
      .finally(() => setLoadingDetail(false))
  }, [open, sale, isOnline, ensureSaleDetail])

  const ctx = useMemo(
    () => ({ branches, settings, paymentMethods, customers }),
    [branches, settings, paymentMethods, customers]
  )

  if (!sale || !detail) return null

  const branchName = branches.find((b) => b.id === detail.branchId)?.name || '—'
  const Icon = Icons[METHOD_ICON[detail.method]] || Icons.Circle
  const invoice = buildInvoiceDataFromSale(detail, ctx)
  const isVoided = detail.status === 'voided'
  const documentId = detail.number || detail.id.toUpperCase()

  const print = () => {
    printSaleInvoice(detail, ctx)
    toast.success('Enviando a impresión…')
  }

  const download = async () => {
    try {
      await downloadSaleInvoicePdf(detail, ctx)
      toast.success('Factura descargada')
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar la factura.')
    }
  }

  const beginVoid = () => {
    if (!canVoidInvoice) {
      setElevationOpen(true)
      return
    }
    setVoidReason('')
    setVoidError('')
    setVoidOpen(true)
  }

  const confirmVoid = async () => {
    if (!canVoidInvoice) {
      toast.error('No tienes permiso para anular facturas.')
      return
    }
    if (voidReason.trim().length < 2) {
      setVoidError('Indica un motivo de al menos 2 caracteres.')
      return
    }
    try {
      const result = await voidSale(detail.id, voidReason.trim())
      if (!result) throw new Error('La factura ya no está disponible para anular.')
      setDetail((current) => ({
        ...current,
        status: 'voided',
        voidReason: voidReason.trim(),
      }))
      useCrmStore.setState((state) => ({
        sales: state.sales.map((item) => (
          item.id === detail.id
            ? { ...item, status: 'voided', voidReason: voidReason.trim() }
            : item
        )),
      }))
      setVoidOpen(false)
      toast.success('Factura anulada')
    } catch (operationError) {
      const message = operationError.message || 'No se pudo anular la factura.'
      setVoidError(message)
      toast.error(message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Detalle de venta" testId="sale-detail-modal" wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-slate-50 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-heading text-lg font-bold text-slate-900" data-testid="sale-detail-id">{documentId}</p>
              <Badge tone={isVoided ? 'danger' : 'success'}>{isVoided ? 'Anulada' : 'Completada'}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{fmtDateTime(detail.createdAt)} · {branchName}</p>
            <p className="mt-2 font-semibold text-slate-800">{detail.customer?.name || 'Cliente Mostrador'}</p>
            {isVoided && detail.voidReason && (
              <p className="mt-2 text-xs font-medium text-red-600">Motivo: {detail.voidReason}</p>
            )}
          </div>
          <div className="text-right">
            <p className={cn('font-heading text-2xl font-bold text-blue-600', isVoided && 'text-slate-400 line-through')}>{formatDOP(detail.total)}</p>
            <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600">
              <Icon className="h-4 w-4 text-slate-400" />
              {METHOD_LABELS[detail.method] || detail.method}
            </span>
            {detail.reference && <p className="mt-1 text-xs text-slate-400">Ref: {detail.reference}</p>}
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
              {loadingDetail && invoice.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">Cargando líneas…</td>
                </tr>
              ) : invoice.items.map((item, idx) => (
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
          <Button variant="secondary" onClick={print} disabled={loadingDetail} data-testid="sale-detail-print">
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="secondary" onClick={download} disabled={loadingDetail} data-testid="sale-detail-download">
            <Download className="h-4 w-4" /> Descargar PDF
          </Button>
          {!isVoided && (
            <Button variant="danger" onClick={beginVoid} disabled={loadingDetail || Boolean(mutating)} data-testid="sale-detail-void">
              <Ban className="h-4 w-4" /> Anular factura
            </Button>
          )}
        </div>
      </div>

      <Modal open={voidOpen} onClose={() => setVoidOpen(false)} title="Anular factura" testId="sale-detail-void-modal">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Esta acción dejará la factura como anulada y ajustará los totales de caja.</p>
          <textarea
            value={voidReason}
            onChange={(event) => {
              setVoidReason(event.target.value)
              setVoidError('')
            }}
            rows={3}
            maxLength={1000}
            placeholder="Motivo de anulación"
            className="w-full resize-none rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-red-500"
            data-testid="sale-detail-void-reason"
          />
          {voidError && <p className="text-sm text-red-600">{voidError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidOpen(false)} disabled={Boolean(mutating)}>Cancelar</Button>
            <Button variant="dangerSolid" onClick={confirmVoid} disabled={Boolean(mutating)} data-testid="sale-detail-confirm-void">
              Anular factura
            </Button>
          </div>
        </div>
      </Modal>

      <PermissionElevationModal
        open={elevationOpen}
        onClose={() => setElevationOpen(false)}
        permissionCode={VOID_INVOICE_PERMISSION}
        description="Para anular una factura, un supervisor con permiso debe autorizar esta sesión por 3 minutos."
        onElevated={() => setVoidOpen(true)}
      />
    </Modal>
  )
}
