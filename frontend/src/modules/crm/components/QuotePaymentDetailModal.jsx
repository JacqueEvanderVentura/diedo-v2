import { useEffect, useMemo, useState } from 'react'
import * as Icons from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { formatDOP } from '@/lib/format'
import { useConfigStore } from '@/stores/configStore'
import { useCrmStore } from '@/stores/crmStore'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'
import { ProofImagePreview } from '@/modules/pos/components/ProofImagePreview'
import { ReceivablePaymentLog } from '@/modules/pos/components/ReceivablePaymentLog'
import { getBalance, getPaidAmount } from '@/modules/pos/lib/receivables'
import { findQuoteReceivable } from '../lib/quoteInvoice'
import { fmtDateTime, METHOD_ICON, METHOD_LABELS } from '../lib/crm'

export function QuotePaymentDetailModal({ open, onClose, quote }) {
  const paymentMethods = useConfigStore((s) => s.paymentMethods)
  const receivables = usePosStore((s) => s.receivables)
  const ensureSaleDetail = useCrmStore((s) => s.ensureSaleDetail)
  const ensureReceivableDetail = usePosStore((s) => s.ensureReceivableDetail)
  const downloadPaymentProof = usePosStore((s) => s.downloadPaymentProof)
  const isOnline = useSessionStore((s) => s.status === 'online')

  const [sale, setSale] = useState(null)
  const [receivable, setReceivable] = useState(null)
  const [loading, setLoading] = useState(false)

  const linkedReceivable = useMemo(
    () => (quote ? findQuoteReceivable(quote, receivables) : null),
    [quote, receivables]
  )

  useEffect(() => {
    if (!open || !quote?.convertedSaleId) {
      setSale(null)
      setReceivable(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const load = async () => {
      try {
        const saleDetail = await ensureSaleDetail(quote.convertedSaleId)
        let receivableDetail = linkedReceivable
        if (isOnline && linkedReceivable?.id) {
          receivableDetail = await ensureReceivableDetail(linkedReceivable.id) || linkedReceivable
        }
        if (!cancelled) {
          setSale(saleDetail)
          setReceivable(receivableDetail)
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error.message || 'No se pudo cargar el detalle del pago')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [
    open,
    quote?.id,
    quote?.convertedSaleId,
    linkedReceivable?.id,
    ensureSaleDetail,
    ensureReceivableDetail,
    isOnline,
  ])

  const handleDownloadProof = async (proof) => {
    try {
      const blob = proof instanceof Blob ? proof : await downloadPaymentProof(proof)
      const anchor = document.createElement('a')
      anchor.href = URL.createObjectURL(blob)
      anchor.download = proof?.name || 'comprobante'
      anchor.click()
      URL.revokeObjectURL(anchor.href)
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar el comprobante')
    }
  }

  if (!quote) return null

  const methodCode = receivable?.method || sale?.method || 'efectivo'
  const methodName = paymentMethods.find((item) => item.id === methodCode)?.name
    || METHOD_LABELS[methodCode]
    || methodCode
  const MethodIcon = Icons[METHOD_ICON[methodCode]] || Icons.Wallet
  const reference = receivable?.reference || sale?.reference || sale?.payment?.reference || null
  const receivableProof = receivable?.proof || null
  const saleProof = sale?.payment?.proof || sale?.payment?.proofs?.[0] || null
  const displayProof = receivableProof || saleProof
  const collectedAt = sale?.createdAt || receivable?.paidAt || receivable?.updatedAt

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalle del pago"
      description={quote.invoiceNumber ? `Factura ${quote.invoiceNumber}` : undefined}
      wide
      testId="quote-payment-detail-modal"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-slate-50 p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-heading text-lg font-bold text-slate-900">
                {quote.invoiceNumber || quote.number}
              </p>
              <Badge tone="success">Pagada</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{quote.customerName}</p>
            {collectedAt && (
              <p className="mt-1 text-xs text-slate-400">{fmtDateTime(collectedAt)}</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-heading text-2xl font-bold text-emerald-600">
              {formatDOP(sale?.total || quote.total || 0)}
            </p>
            <span className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600">
              <MethodIcon className="h-4 w-4 text-slate-400" />
              {methodName}
            </span>
          </div>
        </div>

        {loading && (
          <p className="text-center text-sm text-slate-400">Cargando detalle del pago…</p>
        )}

        {!loading && (
          <>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between sm:block">
                <dt className="text-slate-500">Referencia</dt>
                <dd className="font-medium">{reference || '—'}</dd>
              </div>
              {receivable && (
                <div className="flex justify-between sm:block">
                  <dt className="text-slate-500">Cobrado</dt>
                  <dd className="font-medium text-emerald-600">{formatDOP(getPaidAmount(receivable))}</dd>
                </div>
              )}
              {receivable && getBalance(receivable) > 0 && (
                <div className="flex justify-between sm:block sm:col-span-2">
                  <dt className="text-slate-500">Saldo pendiente</dt>
                  <dd className="font-medium text-amber-600">{formatDOP(getBalance(receivable))}</dd>
                </div>
              )}
            </dl>

            {displayProof && (
              <ProofImagePreview
                proof={displayProof}
                loadProof={downloadPaymentProof}
                onDownload={handleDownloadProof}
              />
            )}

            {receivable && (
              <div>
                <h4 className="mb-3 font-heading font-semibold text-slate-900">Historial de pagos</h4>
                <ReceivablePaymentLog
                  receivable={receivable}
                  onDownload={handleDownloadProof}
                />
              </div>
            )}

            {!receivable && !displayProof && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Cobro registrado al emitir la factura
                {reference ? ` · Ref. ${reference}` : ''}.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
