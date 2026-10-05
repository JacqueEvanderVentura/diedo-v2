import { Download, RotateCcw } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/modules/crm/lib/crm'
import { PAYMENT_METHODS } from '../lib/receivables'
import { buildInvoicePaymentLog } from '../lib/invoicePaymentLog'

function methodLabel(method) {
  return PAYMENT_METHODS.find((item) => item.id === method)?.label || method
}

function statusHint(entry) {
  if (entry.reversed) return ' · Reversado'
  if (entry.source === 'checkout' && entry.status === 'awaiting_approval') {
    return ' · Pendiente de aprobación'
  }
  if (entry.source === 'receivable' && entry.status === 'reversed') return ' · Reversado'
  return ''
}

export function InvoicePaymentLog({
  sale = null,
  receivable = null,
  onReverse,
  onDownload,
  busy = false,
}) {
  const entries = buildInvoicePaymentLog({ sale, receivable })
  const total = entries.length

  if (!total) {
    return <p className="text-sm text-slate-500">Sin pagos registrados aún.</p>
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <div key={entry.key} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-800">
              {entry.sourceLabel}
              {total > 1 ? ` ${index + 1} de ${total}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'font-heading font-bold',
                  entry.reversed ? 'text-slate-400 line-through' : 'text-emerald-700'
                )}
              >
                {formatDOP(entry.amount)}
              </span>
              {!entry.reversed && entry.paymentId && onReverse && (
                <button
                  type="button"
                  title="Reversar pago"
                  disabled={busy}
                  onClick={() => onReverse({ id: entry.paymentId, amount: entry.amount })}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {methodLabel(entry.method)}
            {entry.reference ? ` · Ref. ${entry.reference}` : ''}
            {entry.createdAt ? ` · ${fmtDate(entry.createdAt)}` : ''}
            {statusHint(entry)}
          </p>
          {entry.note && <p className="mt-1 text-xs text-slate-600">{entry.note}</p>}
          {entry.proofs.map((proof) => (
            <button
              key={proof.id || proof.name}
              type="button"
              disabled={busy}
              onClick={() => onDownload?.(proof)}
              className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
            >
              <Download className="h-3 w-3" />
              Descargar {proof.name || 'comprobante'}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
