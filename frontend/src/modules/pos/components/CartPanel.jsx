import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ShoppingCart, Plus, Trash2, Printer, Download, Wallet, Percent, ChevronDown } from 'lucide-react'
import { usePosStore, RECEIVABLE_METHODS } from '@/stores/posStore'
import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { CartItem } from './CartItem'
import { CustomerSelector } from './CustomerSelector'
import { PaymentSection } from './PaymentSection'
import { buildInvoiceHtml, printInvoice, downloadInvoice, makeInvoiceId, formatInvoiceDate, invoiceFilename } from '../lib/invoice'

export function CartPanel({ onCheckoutDone }) {
  const items = usePosStore((s) => s.items)
  const clearCart = usePosStore((s) => s.clearCart)
  const discountMode = usePosStore((s) => s.discountMode)
  const discountValue = usePosStore((s) => s.discountValue)
  const setDiscountMode = usePosStore((s) => s.setDiscountMode)
  const setDiscountValue = usePosStore((s) => s.setDiscountValue)
  const paymentMethod = usePosStore((s) => s.paymentMethod)
  const transferProof = usePosStore((s) => s.transferProof)
  const paymentReference = usePosStore((s) => s.paymentReference)
  const getSubtotal = usePosStore((s) => s.getSubtotal)
  const getDiscountAmount = usePosStore((s) => s.getDiscountAmount)
  const getDiscountPct = usePosStore((s) => s.getDiscountPct)
  const getTaxAmount = usePosStore((s) => s.getTaxAmount)
  const getTotal = usePosStore((s) => s.getTotal)
  const taxPct = usePosStore((s) => s.taxPct)
  const register = usePosStore((s) => s.register)
  const recordSale = usePosStore((s) => s.recordSale)
  const customer = usePosStore((s) => s.customer)
  const decrementForSale = useCatalogStore((s) => s.decrementForSale)
  const addExpense = usePosStore((s) => s.addExpense)
  const isExpense = usePosStore((s) => s.isExpense)
  const toggleExpense = usePosStore((s) => s.toggleExpense)
  const branchId = usePosStore((s) => s.branchId)
  const branches = useConfigStore((s) => s.branches)
  const paymentMethods = useConfigStore((s) => s.paymentMethods)
  const settings = useConfigStore((s) => s.settings)

  const [payError, setPayError] = useState(false)
  const [discountOpen, setDiscountOpen] = useState(false)

  const empty = items.length === 0
  const discountAmt = getDiscountAmount()

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
    // Transfer: needs EITHER an uploaded proof OR a reference number (one of two).
    if (paymentMethod === 'transferencia' && !isExpense && !transferProof && !paymentReference.trim()) {
      setPayError(true)
      return
    }
    setPayError(false)
    const total = getTotal()

    if (isExpense) {
      const concept = items.map((i) => `${i.qty}× ${i.name}`).join(', ') || 'Gasto POS'
      addExpense({
        concept,
        amount: total,
        items,
        method: paymentMethod,
        reference: paymentReference.trim() || null,
      })
      decrementForSale(items)
      toast.success(`Gasto registrado · ${formatDOP(total)}`)
      clearCart()
      onCheckoutDone?.()
      return
    }
    recordSale({ total, method: paymentMethod, customer, reference: paymentReference, items })
    decrementForSale(items)
    if (RECEIVABLE_METHODS.includes(paymentMethod)) {
      toast.success(`Cuenta por cobrar generada · ${formatDOP(total)}`)
    } else {
      toast.success(`Venta cobrada · ${formatDOP(total)}`)
    }
    clearCart()
    onCheckoutDone?.()
  }

  const buildCurrentInvoice = () => {
    const issuedAt = new Date()
    const kind = isExpense ? 'expense' : 'sale'
    const id = makeInvoiceId(issuedAt, kind)
    return {
      id,
      html: buildInvoiceHtml({
        id,
        kind,
        issuedAt: formatInvoiceDate(issuedAt),
        businessName: settings.businessName || 'Diedo App',
        branchName: branches.find((b) => b.id === branchId)?.name || '',
        region: settings.region || '',
        customerName: customer?.name || 'Cliente Mostrador',
        customerPhone: customer?.phone || '',
        paymentMethod: paymentMethods.find((m) => m.id === paymentMethod)?.name || paymentMethod,
        paymentReference: paymentReference.trim(),
        items,
        subtotal: getSubtotal(),
        discountAmt,
        discountPct: getDiscountPct(),
        taxPct,
        taxAmt: getTaxAmount(),
        total: getTotal(),
      }),
    }
  }

  const handlePrint = () => {
    if (empty) return toast.error('El carrito está vacío')
    printInvoice(buildCurrentInvoice().html)
  }

  const handleDownload = () => {
    if (empty) return toast.error('El carrito está vacío')
    const { id, html } = buildCurrentInvoice()
    downloadInvoice(html, invoiceFilename(id))
    toast.success(isExpense ? 'Gasto descargado' : 'Factura descargada')
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-white">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 py-4 pl-5 pr-16 lg:pr-5">
        <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900">Carrito Actual</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => toast('Item manual (próximamente)')} data-testid="cart-add-item" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50">
            <Plus className="h-3.5 w-3.5" /> Item
          </button>
          <button onClick={handleClear} data-testid="cart-clear" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" /> Limpiar
          </button>
        </div>
      </div>

      {/* Scroll area */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4">
        <CustomerSelector />

        {empty ? (
          <EmptyState icon={ShoppingCart} title="Carrito vacío" description="Agrega productos o servicios desde la izquierda para iniciar una venta." className="py-10" />
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
            {/* Discount — collapsed by default, expands to amount/% controls */}
            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setDiscountOpen((o) => !o)}
                data-testid="cart-discount-toggle"
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-600"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Percent className="h-4 w-4 shrink-0" />
                  Descuento
                  {discountAmt > 0 && (
                    <span className="truncate font-medium text-emerald-600">
                      · −{formatDOP(discountAmt)}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200', discountOpen && 'rotate-180')}
                />
              </button>

              <AnimatePresence initial={false}>
                {discountOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">Tipo</span>
                        <div className="flex rounded-lg bg-slate-100 p-0.5">
                          <button
                            type="button"
                            onClick={() => setDiscountMode('amount')}
                            data-testid="cart-discount-mode-amount"
                            className={cn('rounded-md px-2.5 py-1 text-xs font-bold transition-colors', discountMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400')}
                          >
                            RD$
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscountMode('pct')}
                            data-testid="cart-discount-mode-pct"
                            className={cn('rounded-md px-2.5 py-1 text-xs font-bold transition-colors', discountMode === 'pct' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400')}
                          >
                            %
                          </button>
                        </div>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={discountValue || ''}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          placeholder="0"
                          data-testid="cart-discount-input"
                          className="w-full rounded-lg border-0 bg-white py-2.5 pl-3 pr-14 text-right text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                          {discountMode === 'amount' ? 'RD$' : '%'}
                        </span>
                      </div>
                      {discountAmt > 0 && (
                        <p className="mt-1.5 text-xs font-medium text-emerald-600" data-testid="cart-discount-helper">
                          {discountMode === 'amount'
                            ? `Equivale a ${getDiscountPct().toFixed(1)}% de descuento`
                            : `Ahorro de ${formatDOP(discountAmt)}`}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <PaymentSection error={payError} />

            {/* Secondary actions */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handlePrint} data-testid="pos-print" className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600">
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              <button onClick={handleDownload} data-testid="pos-download" className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600">
                <Download className="h-4 w-4" /> Descargar
              </button>
              <button
                type="button"
                onClick={toggleExpense}
                data-testid="pos-expense-toggle"
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border py-2.5 text-[11px] font-semibold transition-colors',
                  isExpense
                    ? 'border-red-500 bg-red-50 text-red-600'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:text-red-600'
                )}
              >
                <Wallet className="h-4 w-4" /> Gasto
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer: totals + CTA */}
      <div className="shrink-0 space-y-3 border-t border-slate-100 bg-slate-50/70 p-4">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span className="font-medium text-slate-700" data-testid="cart-subtotal">{formatDOP(getSubtotal())}</span>
          </div>
          {discountAmt > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Descuento ({getDiscountPct().toFixed(1)}%)</span>
              <span className="font-medium" data-testid="cart-discount-amount">−{formatDOP(discountAmt)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-500">
            <span>ITBIS ({taxPct}%)</span>
            <span className="font-medium text-slate-700" data-testid="cart-tax">{formatDOP(getTaxAmount())}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <span className="font-heading text-base font-bold text-slate-900">Total</span>
            <span className={cn('font-heading text-2xl font-bold tracking-tight', isExpense ? 'text-red-600' : 'text-blue-600')} data-testid="cart-total">{formatDOP(getTotal())}</span>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full"
          variant={isExpense ? 'dangerSolid' : 'primary'}
          onClick={handleCheckout}
          disabled={empty}
          data-testid="pos-checkout-btn"
        >
          <Wallet className="h-4 w-4" /> {isExpense ? 'Registrar gasto' : 'Cobrar'} {!empty && `· ${formatDOP(getTotal())}`}
        </Button>
      </div>
    </div>
  )
}
