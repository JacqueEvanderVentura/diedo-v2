import { useRef } from 'react'
import { Banknote, CreditCard, ArrowLeftRight, Link2, Clock, Upload, CheckCircle2, Hash } from 'lucide-react'
import { PAYMENT_METHODS } from '@/data/products'
import { usePosStore } from '@/stores/posStore'
import { cn } from '@/lib/utils'

const ICONS = { Banknote, CreditCard, ArrowLeftRight, Link2, Clock }

const REF_LABELS = {
  efectivo: 'N° de referencia (opcional)',
  tarjeta: 'N° de comprobante / voucher',
  transferencia: 'N° de referencia de transferencia',
  link: 'N° de referencia del link',
  cxc: 'N° de referencia (opcional)',
}

export function PaymentSection({ error }) {
  const paymentMethod = usePosStore((s) => s.paymentMethod)
  const setPaymentMethod = usePosStore((s) => s.setPaymentMethod)
  const transferProof = usePosStore((s) => s.transferProof)
  const setTransferProof = usePosStore((s) => s.setTransferProof)
  const paymentReference = usePosStore((s) => s.paymentReference)
  const setPaymentReference = usePosStore((s) => s.setPaymentReference)
  const fileRef = useRef(null)

  const isReceivable = ['transferencia', 'link', 'cxc'].includes(paymentMethod)
  const isTransfer = paymentMethod === 'transferencia'
  // Transfer validity: proof OR reference (one of two).
  const transferMissing = isTransfer && !transferProof && !paymentReference.trim()
  const showRefError = isTransfer && error && transferMissing

  return (
    <div data-testid="pos-payment-section">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Método de pago</p>
      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_METHODS.map((m) => {
          const Icon = ICONS[m.icon]
          const active = paymentMethod === m.id
          return (
            <button
              key={m.id}
              onClick={() => setPaymentMethod(m.id)}
              data-testid={`pos-payment-${m.id}`}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-[11px] font-semibold transition-[background-color,color,border-color] duration-200',
                active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200'
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {m.name}
            </button>
          )
        })}
      </div>

      {isReceivable && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
          Genera una <span className="font-bold">cuenta por cobrar</span> hasta confirmar el pago.
        </p>
      )}

      {isTransfer && (
        <p className="mt-2 text-[11px] font-medium text-slate-400">
          Ingresa el <span className="font-semibold text-slate-500">N° de referencia</span> <span className="font-bold">o</span> sube el comprobante (una de las dos).
        </p>
      )}

      {/* Reference / voucher number */}
      <div className="relative mt-2">
        <Hash className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', showRefError ? 'text-red-400' : 'text-slate-400')} />
        <input
          value={paymentReference}
          onChange={(e) => setPaymentReference(e.target.value)}
          placeholder={REF_LABELS[paymentMethod]}
          data-testid="pos-payment-reference"
          className={cn(
            'w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600',
            showRefError ? 'ring-red-300' : 'ring-slate-200'
          )}
        />
      </div>

      {isTransfer && (
        <div className="mt-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            data-testid="pos-transfer-file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setTransferProof({ name: f.name })
            }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              data-testid="pos-transfer-upload"
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-dashed p-2.5 text-left text-sm transition-colors',
                transferProof
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : showRefError
                    ? 'border-red-300 bg-red-50 text-red-600'
                    : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-blue-50'
              )}
            >
              {transferProof ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <Upload className="h-5 w-5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate font-medium">
                {transferProof ? transferProof.name : 'Subir comprobante'}
              </span>
            </button>
            {transferProof && (
              <button
                onClick={() => setTransferProof(null)}
                data-testid="pos-transfer-remove"
                className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                Quitar
              </button>
            )}
          </div>
          {showRefError && (
            <p className="mt-1.5 text-xs font-medium text-red-500" data-testid="pos-transfer-error">
              Ingresa el N° de referencia o sube el comprobante.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
