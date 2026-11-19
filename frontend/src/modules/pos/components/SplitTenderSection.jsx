import { useState } from 'react'
import { CreditCard, Pencil } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { formatDOP } from '@/lib/format'
import { splitPaymentSummary, sumSplitDraft } from '../lib/splitPayment'
import { SplitPaymentModal } from './SplitPaymentModal'

export function SplitTenderSection({ total, tenders: tendersProp, onTendersChange }) {
  const paymentMethods = useConfigStore((s) => s.paymentMethods)
  const storeTenders = usePosStore((s) => s.checkoutTenders)
  const setCheckoutTenders = usePosStore((s) => s.setCheckoutTenders)
  const tenders = tendersProp !== undefined ? tendersProp : storeTenders
  const setTenders = onTendersChange || setCheckoutTenders
  const [open, setOpen] = useState(false)
  const splitEnabled = Array.isArray(tenders) && tenders.length > 0
  const summary = splitPaymentSummary(tenders, paymentMethods)
  const allocated = sumSplitDraft(tenders)
  const remaining = Math.max(0, (Number(total) || 0) - allocated)

  const disableSplit = () => setTenders(null)

  return (
    <div className="mt-3" data-testid="pos-split-payment">
      {splitEnabled ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Pago dividido</p>
            <p className="truncate text-sm font-medium text-slate-700">{summary}</p>
            <p className="text-xs text-slate-500">
              Abono · {formatDOP(allocated)}
              {remaining > 0.009 ? ` · saldo CxC ${formatDOP(remaining)}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50"
              data-testid="pos-split-payment-edit"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
            <button
              type="button"
              onClick={disableSplit}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Un solo método
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="pos-split-payment-toggle"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700"
        >
          <CreditCard className="h-4 w-4" />
          Pago dividido
        </button>
      )}

      <SplitPaymentModal
        open={open}
        onClose={() => setOpen(false)}
        total={total}
        paymentMethods={paymentMethods}
        initialTenders={tenders}
        onConfirm={(rows) => setTenders(rows)}
      />
    </div>
  )
}
