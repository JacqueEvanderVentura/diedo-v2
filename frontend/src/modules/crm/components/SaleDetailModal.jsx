import { useEffect, useMemo, useState } from 'react'
import * as Icons from 'lucide-react'
import { Printer, Download, Ban, DollarSign, CheckCircle2, RotateCcw, Upload, Pencil, Trash2, History } from 'lucide-react'
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
import { fmtDateTime, METHOD_LABELS, METHOD_ICON, saleStatusBadge } from '../lib/crm'
import { buildInvoiceDataFromSale, downloadSaleInvoicePdf, printSaleInvoice } from '../lib/sales'
import { collectSalePaymentProofs, findReceivableForSale } from '../lib/saleProofs'
import { AttachmentProofSection } from '@/components/ui/AttachmentProofSection'
import { posApi } from '@/services/posApi'
import { mapReceivableFromApi } from '@/services/adapters/pos'
import { cn } from '@/lib/utils'
import { ReceivablePaymentModal } from '@/modules/pos/components/ReceivablePaymentModal'
import { InvoicePaymentLog } from '@/modules/pos/components/InvoicePaymentLog'
import { ReceivableProofModal } from '@/modules/pos/components/ReceivableProofModal'
import {
  getBalance,
  requiresPaymentApproval,
  canAttachNewReceivableProof,
  canShowReceivableUnapprove,
  receivableHasEvidence,
  isReceivableProofRequiredError,
} from '@/modules/pos/lib/receivables'
import { QUOTE_REVISION_EVENT_LABELS } from '@/modules/crm/lib/quoteRevisions'
import { SaleEditModal } from '@/modules/crm/components/SaleEditModal'

const VOID_INVOICE_PERMISSION = 'sales.invoice.void'
const EDIT_INVOICE_PERMISSION = 'sales.invoice.edit'
const DELETE_INVOICE_PERMISSION = 'sales.invoice.delete'

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
  const ensureQuoteDetail = useCrmStore((s) => s.ensureQuoteDetail)
  const quotes = useCrmStore((s) => s.quotes)
  const voidSale = usePosStore((s) => s.voidSale)
  const deleteSale = usePosStore((s) => s.deleteSale)
  const downloadPaymentProof = usePosStore((s) => s.downloadPaymentProof)
  const reversePayment = usePosStore((s) => s.reversePayment)
  const approveReceivablePayment = usePosStore((s) => s.approveReceivablePayment)
  const unapproveReceivablePayment = usePosStore((s) => s.unapproveReceivablePayment)
  const deleteReceivableProof = usePosStore((s) => s.deleteReceivableProof)
  const attachReceivableProof = usePosStore((s) => s.attachReceivableProof)
  const receivables = usePosStore((s) => s.receivables)
  const mutating = usePosStore((s) => s.mutating)
  const canVoidInvoice = useSessionStore((s) => s.hasPermission(VOID_INVOICE_PERMISSION))
  const canEditInvoice = useSessionStore((s) => s.hasPermission(EDIT_INVOICE_PERMISSION))
  const canDeleteInvoice = useSessionStore((s) => s.hasPermission(DELETE_INVOICE_PERMISSION))
  const canCollectReceivables = useSessionStore((s) => s.hasPermission('pos.receivables.collect'))
  const isOnline = useSessionStore((s) => s.status === 'online')
  const [detail, setDetail] = useState(sale)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [elevationOpen, setElevationOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError] = useState('')
  const [receivableDetail, setReceivableDetail] = useState(null)
  const [collectPaymentOpen, setCollectPaymentOpen] = useState(false)
  const [proofUploadOpen, setProofUploadOpen] = useState(false)
  const [quoteDetail, setQuoteDetail] = useState(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const refreshReceivableForSale = (saleId) => {
    if (!saleId) return
    const cached = findReceivableForSale(usePosStore.getState().receivables, saleId)
    setReceivableDetail(cached)
    if (!isOnline) return
    posApi.getReceivableForSale(saleId)
      .then((response) => setReceivableDetail(mapReceivableFromApi(response)))
      .catch(() => setReceivableDetail(findReceivableForSale(usePosStore.getState().receivables, saleId)))
  }

  useEffect(() => {
    if (!open || !sale) {
      setDetail(null)
      setReceivableDetail(null)
      setCollectPaymentOpen(false)
      setProofUploadOpen(false)
      setQuoteDetail(null)
      return
    }
    setDetail(sale)
    setReceivableDetail(findReceivableForSale(receivables, sale.id))
    let cancelled = false
    if (isOnline) {
      posApi.getReceivableForSale(sale.id)
        .then((response) => {
          if (!cancelled) setReceivableDetail(mapReceivableFromApi(response))
        })
        .catch(() => {
          if (!cancelled) setReceivableDetail(findReceivableForSale(receivables, sale.id))
        })
    }
    const needsLines = !sale.detailLoaded && !sale.items?.length
    if (!isOnline || !needsLines) {
      return () => { cancelled = true }
    }
    setLoadingDetail(true)
    ensureSaleDetail(sale.id)
      .then((loaded) => {
        if (loaded && !cancelled) setDetail(loaded)
      })
      .catch(() => toast.error('No se pudo cargar el detalle de la venta'))
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => { cancelled = true }
  }, [open, sale, isOnline, ensureSaleDetail, receivables])

  useEffect(() => {
    if (!open || !sale) return
    const quoteId = sale.quoteId || quotes.find((item) => item.convertedSaleId === sale.id)?.id
    if (!quoteId) {
      setQuoteDetail(null)
      return
    }
    let cancelled = false
    setLoadingQuote(true)
    ensureQuoteDetail(quoteId)
      .then((loaded) => {
        if (!cancelled) setQuoteDetail(loaded)
      })
      .catch(() => {
        if (!cancelled) setQuoteDetail(quotes.find((item) => item.id === quoteId) || null)
      })
      .finally(() => {
        if (!cancelled) setLoadingQuote(false)
      })
    return () => { cancelled = true }
  }, [open, sale, quotes, ensureQuoteDetail])

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
  const receivableBalance = receivableDetail ? getBalance(receivableDetail) : 0
  const statusBadge = saleStatusBadge(detail, receivableDetail)
  const canApprovePayment = !isVoided
    && canCollectReceivables
    && receivableDetail
    && requiresPaymentApproval(receivableDetail)
  const canUnapprovePayment = !isVoided
    && canCollectReceivables
    && receivableDetail
    && canShowReceivableUnapprove(receivableDetail)
  const canUploadProof = !isVoided
    && canCollectReceivables
    && receivableDetail
    && canAttachNewReceivableProof(receivableDetail)
  const canRegisterPayment = !isVoided
    && canCollectReceivables
    && receivableDetail
    && !requiresPaymentApproval(receivableDetail)
    && receivableBalance > 0
    && !receivableHasEvidence(receivableDetail)
  const paymentProofs = collectSalePaymentProofs(detail, receivableDetail)
  const proofSubtitle = [
    METHOD_LABELS[detail.method] || detail.method,
    detail.reference ? `Ref. ${detail.reference}` : null,
  ].filter(Boolean).join(' · ')

  const handleReversePayment = async (payment) => {
    if (!payment?.id) return
    if (!window.confirm(`¿Reversar el pago de ${formatDOP(payment.amount)}?`)) return
    try {
      await reversePayment(payment.id)
      toast.success('Pago reversado')
      refreshReceivableForSale(detail.id)
    } catch (error) {
      toast.error(error.message || 'No se pudo reversar el pago.')
    }
  }

  const handleDownloadProof = async (proof) => {
    try {
      const blob = proof instanceof Blob ? proof : await downloadPaymentProof(proof)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = proof?.name || 'comprobante'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar el comprobante.')
    }
  }

  const handleApprovePayment = async () => {
    if (!receivableDetail?.id) return
    try {
      await approveReceivablePayment(receivableDetail.id)
      toast.success('Pago aprobado · factura comprobada')
      refreshReceivableForSale(detail.id)
    } catch (error) {
      const message = error.message || 'No se pudo aprobar el pago.'
      if (isReceivableProofRequiredError(message)) {
        usePosStore.setState({ error: null })
        setProofUploadOpen(true)
        toast.info('Sube el comprobante para aprobar el pago.')
        return
      }
      toast.error(message)
    }
  }

  const handleUnapprovePayment = async () => {
    if (!receivableDetail?.id) return
    try {
      await unapproveReceivablePayment(receivableDetail.id)
      toast.success('Pago desaprobado · cuenta por cobrar')
      refreshReceivableForSale(detail.id)
    } catch (error) {
      toast.error(error.message || 'No se pudo desaprobar el pago.')
    }
  }

  const handleDeleteProof = async (proof) => {
    if (!receivableDetail?.id || !proof?.id) return
    try {
      await deleteReceivableProof(receivableDetail.id, proof.id)
      toast.success('Comprobante eliminado')
      refreshReceivableForSale(detail.id)
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar el comprobante.')
    }
  }

  const handleProofUpload = async (_receivable, payload) => {
    if (!receivableDetail?.id) return
    await attachReceivableProof(receivableDetail.id, payload)
    toast.success('Comprobante registrado · pendiente de aprobación')
    setProofUploadOpen(false)
    refreshReceivableForSale(detail.id)
  }

  const print = () => {
    printSaleInvoice(detail, ctx).catch((error) => {
      toast.error(error.message || 'No se pudo imprimir la factura.')
    })
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

  const confirmDelete = async () => {
    try {
      await deleteSale(detail.id)
      useCrmStore.setState((state) => ({
        sales: state.sales.filter((item) => item.id !== detail.id),
      }))
      setDeleteOpen(false)
      toast.success('Factura eliminada')
      onClose()
    } catch (operationError) {
      toast.error(operationError.message || 'No se pudo eliminar la factura.')
    }
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
              <Badge tone={statusBadge.tone} data-testid="sale-detail-status">{statusBadge.label}</Badge>
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

        {quoteDetail && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4" data-testid="sale-detail-quote-history">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cotización origen</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-800">
              {quoteDetail.number}
              {quoteDetail.invoiceNumber ? ` → ${quoteDetail.invoiceNumber}` : ''}
            </p>
            {loadingQuote ? (
              <p className="mt-3 text-sm text-slate-500">Cargando historial…</p>
            ) : (quoteDetail.revisions || []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Sin revisiones registradas.</p>
            ) : (
              <ul className="mt-3 max-h-56 space-y-3 overflow-y-auto scrollbar-thin">
                {quoteDetail.revisions.map((revision) => (
                  <li key={revision.revision} className="rounded-lg border border-slate-100 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        {QUOTE_REVISION_EVENT_LABELS[revision.event] || revision.event}
                      </span>
                      <span className="text-xs text-slate-400">{fmtDateTime(revision.occurredAt)}</span>
                    </div>
                    <p className="mt-1 text-slate-600">
                      {revision.snapshot?.customerName || quoteDetail.customerName}
                      {' · '}
                      {formatDOP(Number(revision.snapshot?.total) || 0)}
                    </p>
                    {revision.snapshot?.lines?.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                        {revision.snapshot.lines.map((line, index) => (
                          <li key={index}>
                            {line.name} × {line.qty} — {formatDOP(Number(line.unitPrice) || 0)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div data-testid="sale-detail-payment-log">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-blue-600" />
            <h4 className="font-heading font-semibold text-slate-900">Historial de pagos</h4>
          </div>
          <InvoicePaymentLog
            sale={detail}
            receivable={receivableDetail}
            onReverse={canCollectReceivables ? handleReversePayment : null}
            onDownload={handleDownloadProof}
            busy={Boolean(mutating)}
          />
        </div>

        <AttachmentProofSection
          title="Comprobantes de ingreso"
          subtitle={proofSubtitle}
          items={paymentProofs}
          loadProof={downloadPaymentProof}
          onDownload={handleDownloadProof}
          onDelete={canCollectReceivables ? handleDeleteProof : null}
          testId="sale-detail-proofs"
        />

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
          {canApprovePayment && (
            <Button
              onClick={handleApprovePayment}
              disabled={loadingDetail}
              data-testid="sale-detail-approve-payment"
            >
              <CheckCircle2 className="h-4 w-4" /> Aprobar pago
            </Button>
          )}
          {canUnapprovePayment && (
            <Button
              variant="secondary"
              onClick={handleUnapprovePayment}
              disabled={loadingDetail}
              data-testid="sale-detail-unapprove-payment"
            >
              <RotateCcw className="h-4 w-4" /> Desaprobar pago
            </Button>
          )}
          {canUploadProof && (
            <Button
              variant="secondary"
              onClick={() => setProofUploadOpen(true)}
              disabled={loadingDetail}
              data-testid="sale-detail-upload-proof"
            >
              <Upload className="h-4 w-4" /> Subir comprobante
            </Button>
          )}
          {canRegisterPayment && (
            <Button
              onClick={() => setCollectPaymentOpen(true)}
              disabled={loadingDetail}
              data-testid="sale-detail-collect-payment"
            >
              <DollarSign className="h-4 w-4" /> Registrar pago
            </Button>
          )}
          {!isVoided && canEditInvoice && (
            <Button
              variant="secondary"
              onClick={() => setEditOpen(true)}
              disabled={loadingDetail || Boolean(mutating)}
              data-testid="sale-detail-edit"
            >
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          )}
          {!isVoided && canVoidInvoice && (
            <Button variant="danger" onClick={beginVoid} disabled={loadingDetail || Boolean(mutating)} data-testid="sale-detail-void">
              <Ban className="h-4 w-4" /> Anular factura
            </Button>
          )}
          {!isVoided && canDeleteInvoice && (
            <Button
              variant="danger"
              onClick={() => setDeleteOpen(true)}
              disabled={loadingDetail || Boolean(mutating)}
              data-testid="sale-detail-delete"
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      <SaleEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        sale={detail}
        onSaved={() => {
          ensureSaleDetail(detail.id).then((fresh) => {
            if (fresh) setDetail(fresh)
          })
        }}
      />

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Eliminar factura" testId="sale-detail-delete-modal">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Esta acción quita la factura del sistema. Solo es posible si no tiene cobros ni movimientos de caja.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={Boolean(mutating)}>Cancelar</Button>
            <Button variant="dangerSolid" onClick={confirmDelete} disabled={Boolean(mutating)} data-testid="sale-detail-confirm-delete">
              Eliminar factura
            </Button>
          </div>
        </div>
      </Modal>

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

      <ReceivablePaymentModal
        open={collectPaymentOpen}
        onClose={() => {
          setCollectPaymentOpen(false)
          refreshReceivableForSale(detail.id)
        }}
        receivable={collectPaymentOpen ? receivableDetail : null}
      />

      <ReceivableProofModal
        open={proofUploadOpen}
        onClose={() => setProofUploadOpen(false)}
        receivable={proofUploadOpen ? receivableDetail : null}
        onConfirm={async (_receivable, payload) => {
          if (!receivableDetail?.id) return
          try {
            if (payload?.proof) {
              await attachReceivableProof(receivableDetail.id, payload)
            }
            await approveReceivablePayment(receivableDetail.id)
            toast.success('Pago aprobado · factura comprobada')
            setProofUploadOpen(false)
            refreshReceivableForSale(detail.id)
          } catch (error) {
            const message = error.message || 'No se pudo aprobar el pago.'
            if (isReceivableProofRequiredError(message)) {
              toast.info('Sube el comprobante para aprobar el pago.')
              return
            }
            toast.error(message)
          }
        }}
        onSaveOnly={handleProofUpload}
      />
    </Modal>
  )
}
