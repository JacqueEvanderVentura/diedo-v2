import { useEffect, useMemo, useState } from 'react'
import { Banknote, CreditCard, ArrowLeftRight, Link2, Wallet, X, Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatDOP } from '@/lib/format'
import {
  applyRestToRow,
  checkoutTendersFromDraft,
  draftFromCheckoutTenders,
  emptySplitDraft,
  splitPaymentMethods,
  sumSplitDraft,
} from '../lib/splitPayment'

const ICONS = { Banknote, CreditCard, ArrowLeftRight, Link2, Wallet }

export function SplitPaymentModal({
  open,
  onClose,
  total,
  paymentMethods,
  initialTenders,
  onConfirm,
}) {
  const methods = useMemo(() => splitPaymentMethods(paymentMethods), [paymentMethods])
  const [draft, setDraft] = useState(() => emptySplitDraft(methods))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(draftFromCheckoutTenders(initialTenders, methods))
    setError('')
  }, [open, initialTenders, methods])

  const allocated = sumSplitDraft(draft)
  const remaining = Math.max(0, (Number(total) || 0) - allocated)
  const canConfirm = remaining <= 0.009 && allocated > 0

  const handleConfirm = () => {
    const result = checkoutTendersFromDraft(draft, total)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onConfirm(result.tenders)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Pago dividido" testId="split-payment-modal" wide>
      <div className="space-y-5">
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-center">
          <p className="text-xs font-medium text-slate-500">Total a pagar</p>
          <p className="font-heading text-3xl font-bold text-slate-900">{formatDOP(total)}</p>
        </div>

        <div className="space-y-3">
          {methods.map((method) => {
            const row = draft.find((item) => item.methodId === method.id) || {
              methodId: method.id,
              amount: '',
              reference: '',
            }
            const Icon = ICONS[method.icon] || Wallet
            const index = draft.findIndex((item) => item.methodId === method.id)
            const updateRow = (patch) => {
              setDraft((current) => current.map((item, i) => (
                i === index ? { ...item, ...patch } : item
              )))
              setError('')
            }
            return (
              <div
                key={method.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-3"
                data-testid={`split-payment-row-${method.id}`}
              >
                <div className="flex min-w-[120px] flex-1 items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Icon className="h-4 w-4" />
                  </span>
                  {method.name}
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(event) => updateRow({ amount: event.target.value })}
                    placeholder="0.00"
                    className="w-32 rounded-xl border-0 bg-slate-50 py-2.5 pl-7 pr-3 text-right text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
                    data-testid={`split-payment-amount-${method.id}`}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setDraft((current) => applyRestToRow(current, method.id, total))}
                  data-testid={`split-payment-resto-${method.id}`}
                >
                  Resto
                </Button>
                {method.id === 'transferencia' && Number(row.amount) > 0 && (
                  <input
                    value={row.reference}
                    onChange={(event) => updateRow({ reference: event.target.value })}
                    placeholder="Ref. transferencia"
                    className="min-w-[160px] flex-1 rounded-xl border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-inset ring-slate-200"
                    data-testid={`split-payment-ref-${method.id}`}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="rounded-xl bg-amber-50 px-4 py-3 text-center">
          <p className="text-xs font-medium text-amber-800/80">Restante</p>
          <p className="font-heading text-2xl font-bold text-amber-700">{formatDOP(remaining)}</p>
        </div>

        {error && <p className="text-sm font-medium text-red-600" data-testid="split-payment-error">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            <X className="h-4 w-4" /> Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid="split-payment-confirm"
          >
            <Check className="h-4 w-4" /> Confirmar pago
          </Button>
        </div>
      </div>
    </Modal>
  )
}
