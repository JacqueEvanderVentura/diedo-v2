import { useRef } from 'react'
import { Banknote, CreditCard, ArrowLeftRight, Upload, CheckCircle2 } from 'lucide-react'
import { PAYMENT_METHODS } from '@/data/products'
import { usePosStore } from '@/stores/posStore'
import { cn } from '@/lib/utils'

const ICONS = { Banknote, CreditCard, ArrowLeftRight }

export function PaymentSection({ error }) {
  const paymentMethod = usePosStore((s) => s.paymentMethod)
  const setPaymentMethod = usePosStore((s) => s.setPaymentMethod)
  const transferProof = usePosStore((s) => s.transferProof)
  const setTransferProof = usePosStore((s) => s.setTransferProof)
  const fileRef = useRef(null)

  return (
    <div data-testid="pos-payment-section">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Método de pago
      </p>
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
                'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-[background-color,color,border-color] duration-200',
                active
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200'
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              {m.name}
            </button>
          )
        })}
      </div>

      {paymentMethod === 'transferencia' && (
        <div className="mt-3">
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
          <button
            onClick={() => fileRef.current?.click()}
            data-testid="pos-transfer-upload"
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border border-dashed p-3 text-left text-sm transition-colors',
              transferProof
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : error
                  ? 'border-red-300 bg-red-50 text-red-600'
                  : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-blue-50'
            )}
          >
            {transferProof ? <CheckCircle2 className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
            <span className="truncate font-medium">
              {transferProof ? transferProof.name : 'Subir comprobante de transferencia'}
            </span>
          </button>
          {error && !transferProof && (
            <p className="mt-1.5 text-xs font-medium text-red-500" data-testid="pos-transfer-error">
              Adjunta el comprobante para continuar.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
