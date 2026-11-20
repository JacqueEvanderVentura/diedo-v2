import { useEffect, useMemo, useState } from 'react'
import { Receipt } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { InlineSetupCard } from '@/components/ui/InlineSetupCard'
import { EmitNcfToggle } from '@/components/fiscal/EmitNcfToggle'
import { formatDOP } from '@/lib/format'
import { PaymentMethodPicker } from '@/modules/pos/components/PaymentMethodPicker'
import { PaymentEvidenceFields } from '@/modules/pos/components/PaymentEvidenceFields'
import { SplitTenderSection } from '@/modules/pos/components/SplitTenderSection'
import { validatePaymentEvidence } from '@/modules/pos/lib/paymentMethods'
import {
  analyzeQuoteInvoicePaymentSetup,
  listCheckoutPaymentMethods,
  resolveQuoteInvoicePaymentMethod,
} from '../lib/quoteInvoice'
import { sumQuoteLines } from '../lib/pipelineInvoice'

export function QuoteInvoiceModal({
  open,
  onClose,
  quote,
  customer,
  paymentMethods = [],
  online = true,
  onSyncPaymentMethods,
  onConfirm,
  loading = false,
}) {
  const enabledMethods = useMemo(
    () => listCheckoutPaymentMethods(paymentMethods),
    [paymentMethods]
  )
  const setupGap = useMemo(
    () => analyzeQuoteInvoicePaymentSetup(paymentMethods, { online }),
    [paymentMethods, online]
  )

  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentProof, setPaymentProof] = useState(null)
  const [tenders, setTenders] = useState(null)
  const [evidenceError, setEvidenceError] = useState(false)
  const [inlineError, setInlineError] = useState(null)
  const [emitNcf, setEmitNcf] = useState(false)
  const splitEnabled = Array.isArray(tenders) && tenders.length > 0

  const selectedMethod = useMemo(
    () => enabledMethods.find((method) => method.id === paymentMethodId) || null,
    [enabledMethods, paymentMethodId]
  )

  useEffect(() => {
    if (!open) return
    setInlineError(null)
    setEvidenceError(false)
    setPaymentReference('')
    setPaymentProof(null)
    setTenders(null)
    setEmitNcf(false)
    const first = enabledMethods[0]
    setPaymentMethodId(first?.id || '')
  }, [open, quote?.id, enabledMethods])

  useEffect(() => {
    if (!open) return
    setPaymentProof(null)
    setEvidenceError(false)
  }, [open, paymentMethodId])

  const total = useMemo(
    () => quote?.total || sumQuoteLines(quote?.items || []),
    [quote]
  )

  const canSubmit = Boolean(quote) && !setupGap && enabledMethods.length > 0
    && (splitEnabled || paymentMethodId)

  const handleConfirm = async () => {
    if (!quote || setupGap) return
    setInlineError(null)
    if (!splitEnabled) {
      const evidenceValidation = validatePaymentEvidence(selectedMethod, {
        reference: paymentReference,
        proof: paymentProof,
      })
      if (evidenceValidation) {
        setEvidenceError(true)
        return
      }
    }
    setEvidenceError(false)
    try {
      if (splitEnabled) {
        await onConfirm?.({
          tenders,
          collectionMode: 'now',
          reference: paymentReference.trim() || null,
          proof: paymentProof,
          emitNcf,
        })
        return
      }
      const resolved = resolveQuoteInvoicePaymentMethod(paymentMethods, { paymentMethodId })
      await onConfirm?.({
        paymentMethod: resolved.semantic,
        paymentMethodId: resolved.semantic,
        collectionMode: resolved.collectionMode,
        reference: paymentReference.trim() || null,
        proof: paymentProof,
        emitNcf,
      })
    } catch (error) {
      if (error.code === 'not_synced') {
        setInlineError({
          title: 'Método sin sincronizar',
          message: error.message,
          actionLabel: onSyncPaymentMethods ? 'Sincronizar ahora' : 'Configurar métodos de pago',
          onAction: onSyncPaymentMethods,
          actionHref: onSyncPaymentMethods ? undefined : '/configuracion?open=metodos-pago',
        })
        return
      }
      setInlineError({
        title: 'No se puede facturar',
        message: error.message || 'Revisa el método de pago seleccionado.',
      })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Emitir factura"
      description={quote ? `Cotización ${quote.number}` : undefined}
      size="md"
      data-testid="quote-invoice-modal"
    >
      {quote && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-900">{customer?.name || quote.customerName}</p>
            <p className="text-slate-500">{quote.items?.length || 0} líneas · Total {formatDOP(total)}</p>
          </div>

          {setupGap && (
            <InlineSetupCard
              title={setupGap.title}
              message={setupGap.message}
              actionLabel={setupGap.actionLabel}
              actionHref={
                setupGap.code === 'not_synced' && onSyncPaymentMethods
                  ? undefined
                  : setupGap.actionHref
              }
              onAction={
                setupGap.code === 'not_synced'
                  ? onSyncPaymentMethods
                  : undefined
              }
              testId="quote-invoice-setup-gap"
            />
          )}

          {!setupGap && enabledMethods.length > 0 && (
            <>
              {!splitEnabled && (
                <PaymentMethodPicker
                  methods={paymentMethods}
                  value={paymentMethodId}
                  onChange={setPaymentMethodId}
                  testIdPrefix="quote-invoice-payment"
                />
              )}
              <SplitTenderSection total={total} tenders={tenders} onTendersChange={setTenders} />
              {!splitEnabled && selectedMethod && (
                <PaymentEvidenceFields
                  method={selectedMethod}
                  reference={paymentReference}
                  onReferenceChange={setPaymentReference}
                  proof={paymentProof}
                  onProofChange={setPaymentProof}
                  showError={evidenceError}
                  testIdPrefix="quote-invoice-evidence"
                />
              )}
            </>
          )}

          {inlineError && (
            <InlineSetupCard
              title={inlineError.title}
              message={inlineError.message}
              actionLabel={inlineError.actionLabel}
              actionHref={inlineError.actionHref}
              onAction={inlineError.onAction}
              testId="quote-invoice-inline-error"
            />
          )}

          <EmitNcfToggle
            checked={emitNcf}
            onChange={setEmitNcf}
            disabled={loading || !canSubmit}
            testId="quote-invoice-emit-ncf-toggle"
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleConfirm}
              disabled={loading || !canSubmit}
              data-testid="quote-invoice-confirm"
            >
              <Receipt className="h-4 w-4" />
              {loading ? 'Emitiendo…' : 'Emitir factura'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
