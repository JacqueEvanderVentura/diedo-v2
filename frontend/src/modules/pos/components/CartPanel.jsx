import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  ShoppingCart,
  Plus,
  Trash2,
  Printer,
  Download,
  Wallet,
  Percent,
} from 'lucide-react'
import { usePosStore, RECEIVABLE_METHODS } from '@/stores/posStore'
import { formatDOP } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { CartItem } from './CartItem'
import { CustomerSelector } from './CustomerSelector'
import { PaymentSection } from './PaymentSection'
import { ExpenseModal } from './ExpenseModal'

export function CartPanel({ onCheckoutDone }) {
  const items = usePosStore((s) => s.items)
  const clearCart = usePosStore((s) => s.clearCart)
  const discountPct = usePosStore((s) => s.discountPct)
  const setDiscountPct = usePosStore((s) => s.setDiscountPct)
  const paymentMethod = usePosStore((s) => s.paymentMethod)
  const transferProof = usePosStore((s) => s.transferProof)
  const getSubtotal = usePosStore((s) => s.getSubtotal)
  const getDiscountAmount = usePosStore((s) => s.getDiscountAmount)
  const getTaxAmount = usePosStore((s) => s.getTaxAmount)
  const getTotal = usePosStore((s) => s.getTotal)
  const taxPct = usePosStore((s) => s.taxPct)
  const register = usePosStore((s) => s.register)
  const recordSale = usePosStore((s) => s.recordSale)
  const customer = usePosStore((s) => s.customer)
  const paymentReference = usePosStore((s) => s.paymentReference)

  const [payError, setPayError] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)

  const empty = items.length === 0

  const handleClear = () => {
    if (empty) return
    clearCart()
    toast('Carrito vaciado', { icon: '🧹' })
  }

  const handleCheckout = () => {
    if (empty) return
    if (!register.open) {
      toast.error('Abre la caja para poder cobrar')
      return
    }
    if (paymentMethod === 'transferencia' && !transferProof) {
      setPayError(true)
      return
    }
    setPayError(false)
    const total = getTotal()
    recordSale({ total, method: paymentMethod, customer, reference: paymentReference, items })
    if (RECEIVABLE_METHODS.includes(paymentMethod)) {
      toast.success(`Cuenta por cobrar generada · ${formatDOP(total)}`)
    } else {
      toast.success(`Venta cobrada · ${formatDOP(total)}`)
    }
    clearCart()
    onCheckoutDone?.()
  }

  const mockAction = (label) => {
    if (empty) return toast.error('El carrito está vacío')
    toast.success(`${label} (simulado)`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 py-4 pl-5 pr-16 lg:pr-5">
        <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900">Carrito Actual</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => toast('Item manual (próximamente)')}
            data-testid="cart-add-item"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" /> Item
          </button>
          <button
            onClick={handleClear}
            data-testid="cart-clear"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" /> Limpiar
          </button>
        </div>
      </div>

      {/* Scroll area: customer + items + discount + payment + secondary */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4">
        <CustomerSelector />

        {empty ? (
          <EmptyState
            icon={ShoppingCart}
            title="Carrito vacío"
            description="Agrega productos o servicios desde la izquierda para iniciar una venta."
            className="py-10"
          />
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <CartItem key={item.id} item={item} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {!empty && (
          <>
            {/* Discount */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <Percent className="h-4 w-4" /> Descuento
              </label>
              <div className="relative w-24">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPct || ''}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  placeholder="0"
                  data-testid="cart-discount-input"
                  className="w-full rounded-lg border-0 bg-white py-2 pl-3 pr-7 text-right text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
              </div>
            </div>

            <PaymentSection error={payError} />

            {/* Secondary actions */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => mockAction('Ticket impreso')}
                data-testid="pos-print"
                className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              <button
                onClick={() => mockAction('Ticket descargado')}
                data-testid="pos-download"
                className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                <Download className="h-4 w-4" /> Descargar
              </button>
              <button
                onClick={() => setExpenseOpen(true)}
                data-testid="pos-expense-open"
                className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                <Wallet className="h-4 w-4" /> Gasto
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer: totals + CTA (always visible) */}
      <div className="shrink-0 space-y-3 border-t border-slate-100 bg-slate-50/70 p-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span className="font-medium text-slate-700" data-testid="cart-subtotal">{formatDOP(getSubtotal())}</span>
          </div>
          {discountPct > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Descuento ({discountPct}%)</span>
              <span className="font-medium" data-testid="cart-discount-amount">−{formatDOP(getDiscountAmount())}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-500">
            <span>ITBIS ({taxPct}%)</span>
            <span className="font-medium text-slate-700" data-testid="cart-tax">{formatDOP(getTaxAmount())}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <span className="font-heading text-base font-bold text-slate-900">Total</span>
            <span className="font-heading text-2xl font-bold tracking-tight text-blue-600" data-testid="cart-total">
              {formatDOP(getTotal())}
            </span>
          </div>
        </div>

        <Button size="lg" className="w-full" onClick={handleCheckout} disabled={empty} data-testid="pos-checkout-btn">
          <Wallet className="h-4 w-4" /> Cobrar {!empty && `· ${formatDOP(getTotal())}`}
        </Button>
      </div>

      <ExpenseModal open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </div>
  )
}
