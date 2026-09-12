import { useMemo } from 'react'
import { Banknote, CreditCard, ArrowLeftRight, Link2, Clock, Wallet, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isReceivableSettlementMethod } from '@/modules/pos/lib/paymentMethods'

const ICONS = { Banknote, CreditCard, ArrowLeftRight, Link2, Clock, Wallet, Landmark }

export function PaymentMethodPicker({
  methods = [],
  value,
  onChange,
  testIdPrefix = 'payment-method',
  className,
}) {
  const enabled = useMemo(
    () => methods.filter((method) => method.enabled),
    [methods]
  )
  const selected = enabled.find((method) => method.id === value) || enabled[0]
  const isReceivable = selected ? isReceivableSettlementMethod(selected) : false

  return (
    <div className={cn('min-w-0', className)} data-testid={`${testIdPrefix}-picker`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Método de pago</p>
      <div className="grid grid-cols-3 gap-2">
        {enabled.map((method) => {
          const Icon = ICONS[method.icon] || Wallet
          const active = value === method.id
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => onChange?.(method.id)}
              data-testid={`${testIdPrefix}-${method.id}`}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-[11px] font-semibold transition-[background-color,color,border-color] duration-200',
                active
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200'
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {method.name}
            </button>
          )
        })}
      </div>
      {isReceivable && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
          Genera una <span className="font-bold">cuenta por cobrar</span> hasta confirmar el pago.
        </p>
      )}
    </div>
  )
}
