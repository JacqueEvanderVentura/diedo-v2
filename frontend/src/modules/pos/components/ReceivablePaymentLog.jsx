import { Download, RotateCcw } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/modules/crm/lib/crm'
import { PAYMENT_METHODS } from '../lib/receivables'

export function ReceivablePaymentLog({
  receivable,
  onReverse,
  onDownload,
  busy = false,
}) {
  const payments = [...(receivable?.payments || [])].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  )
  const total = payments.length

  if (!total) {
    return <p className="text-sm text-slate-500">Sin pagos registrados aún.</p>
  }

  return (
    <div className="space-y-2">
      {payments.map((payment, index) => {
        const methodLabel = PAYMENT_METHODS.find((m) => m.id === payment.method)?.label || payment.method
        return (
          <div key={payment.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">
                Pago {index + 1}{total > 1 ? ` de ${total}` : ''}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'font-heading font-bold',
                    payment.reversed ? 'text-slate-400 line-through' : 'text-emerald-700'
                  )}
                >
                  {formatDOP(payment.amount)}
                </span>
                {!payment.reversed && onReverse && (
                  <button
                    type="button"
                    title="Reversar pago"
                    disabled={busy}
                    onClick={() => onReverse(payment)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {methodLabel}
              {payment.reference ? ` · Ref. ${payment.reference}` : ''}
              {payment.createdAt ? ` · ${fmtDate(payment.createdAt)}` : ''}
            </p>
            {payment.note && <p className="mt-1 text-xs text-slate-600">{payment.note}</p>}
            {payment.proof && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDownload?.(payment.proof)}
                className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
              >
                <Download className="h-3 w-3" />
                Descargar {payment.proof.name}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
