import { useMemo, useState } from 'react'

import { AnimatePresence, motion } from 'framer-motion'

import { toast } from 'sonner'

import { ShoppingCart, Trash2, Printer, Download, Wallet, Percent, ChevronDown, Clock, FileText, Receipt } from 'lucide-react'

import { usePosStore, RECEIVABLE_METHODS } from '@/stores/posStore'

import { useCatalogStore } from '@/stores/catalogStore'

import { useConfigStore } from '@/stores/configStore'

import { formatDOP } from '@/lib/format'

import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/Button'

import { Tip } from '@/components/ui/Tip'

import { EmptyState } from '@/components/ui/EmptyState'

import { CartItem } from './CartItem'

import { CustomerSelector } from './CustomerSelector'

import { CustomerDebtBanner } from './CustomerDebtBanner'

import { HeldCartsModal } from './HeldCartsModal'

import { PaymentSection } from './PaymentSection'

import { ReceivablePaymentModal } from './ReceivablePaymentModal'

import { buildInvoiceHtml, printInvoice, downloadInvoicePdf, makeInvoiceId, formatInvoiceDate, invoiceFilename } from '../lib/invoice'



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

  const documentKind = usePosStore((s) => s.documentKind)

  const isFinalized = usePosStore((s) => s.isFinalized)

  const heldCarts = usePosStore((s) => s.heldCarts)

  const setDocumentKind = usePosStore((s) => s.setDocumentKind)

  const retainCart = usePosStore((s) => s.retainCart)

  const restoreHeldCart = usePosStore((s) => s.restoreHeldCart)

  const removeHeldCart = usePosStore((s) => s.removeHeldCart)

  const saveOpenQuote = usePosStore((s) => s.saveOpenQuote)

  const requestBill = usePosStore((s) => s.requestBill)

  const loadOpenQuoteToCart = usePosStore((s) => s.loadOpenQuoteToCart)

  const addOpenAccountToCart = usePosStore((s) => s.addOpenAccountToCart)

  const addReceivableToCart = usePosStore((s) => s.addReceivableToCart)

  const removeOpenQuote = usePosStore((s) => s.removeOpenQuote)

  const getCustomerDebtSummary = usePosStore((s) => s.getCustomerDebtSummary)
  const receivables = usePosStore((s) => s.receivables)
  const openQuotes = usePosStore((s) => s.openQuotes)

  const branches = useConfigStore((s) => s.branches)

  const paymentMethods = useConfigStore((s) => s.paymentMethods)

  const settings = useConfigStore((s) => s.settings)



  const [payError, setPayError] = useState(false)

  const [discountOpen, setDiscountOpen] = useState(false)

  const [heldOpen, setHeldOpen] = useState(false)

  const [paymentReceivable, setPaymentReceivable] = useState(null)



  const empty = items.length === 0

  const discountAmt = getDiscountAmount()

  const isQuote = documentKind === 'quote' && !isFinalized

  const isInvoice = documentKind === 'invoice' || isFinalized



  const customerDebt = useMemo(
    () => (customer?.id ? getCustomerDebtSummary(customer.id) : null),
    [customer?.id, receivables, openQuotes, getCustomerDebtSummary]
  )



  const resolveDocKind = () => {

    if (isExpense) return 'expense'

    if (isQuote) return 'quote'

    return 'sale'

  }



  const handleClear = () => {

    if (empty) return

    clearCart()

    toast('Carrito vaciado', { icon: '🧹' })

  }



  const handleRetain = () => {

    if (empty) return toast.error('El carrito está vacío')

    if (retainCart()) toast.success('Venta retenida')

  }



  const handleSaveQuote = () => {

    if (empty) return toast.error('El carrito está vacío')

    if (saveOpenQuote()) toast.success('Cotización guardada en ventas retenidas')

  }



  const handleRequestBill = () => {

    if (empty) return toast.error('El carrito está vacío')

    if (requestBill()) toast.success('Cuenta pedida — lista para facturar')

  }



  const handleCollectQuote = () => {

    if (!customerDebt?.openQuote) return

    loadOpenQuoteToCart(customerDebt.openQuote.id)

    requestBill()

    toast.success('Cuenta lista para cobrar')

  }



  const handleCollectReceivable = () => {

    if (!customerDebt?.receivables?.[0]) return

    setPaymentReceivable(customerDebt.receivables[0])

  }



  const handleAddQuoteToCart = () => {

    if (!customerDebt?.openQuote) return

    if (loadOpenQuoteToCart(customerDebt.openQuote.id)) {

      toast.success('Cotización agregada al carrito')

    }

  }



  const handleAddReceivableToCart = () => {

    if (!customer?.id) return

    if (addReceivableToCart(customer.id)) {

      toast.success('Saldo CxC agregado al carrito')

    }

  }



  const handleAddAllToCart = () => {

    if (!customer?.id) return

    if (addOpenAccountToCart(customer.id)) {

      toast.success('Pendientes agregados al carrito')

    }

  }



  const handleCheckout = () => {

    if (empty) return

    if (isQuote) return handleSaveQuote()

    if (!register.open) {

      toast.error('Abre la caja para poder cobrar')

      return

    }

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



    recordSale({ total, method: paymentMethod, customer, reference: paymentReference, items, subtotal: getSubtotal(), discountAmt, discountPct: getDiscountPct(), taxPct, taxAmt: getTaxAmount() })

    decrementForSale(items)

    removeOpenQuote(customer?.id)

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

    const kind = resolveDocKind()

    const id = makeInvoiceId(issuedAt, kind)

    const data = {

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

    }

    return { id, data, html: buildInvoiceHtml(data) }

  }



  const handlePrint = () => {

    if (empty) return toast.error('El carrito está vacío')

    printInvoice(buildCurrentInvoice().html)

  }



  const handleDownload = () => {

    if (empty) return toast.error('El carrito está vacío')

    const { id, data } = buildCurrentInvoice()

    downloadInvoicePdf(data, invoiceFilename(id))

    toast.success(isExpense ? 'Gasto descargado' : isQuote ? 'Cotización descargada' : 'Factura descargada')

  }



  const restoreHeld = (id) => {

    const held = heldCarts.find((h) => h.id === id)

    if (restoreHeldCart(id)) {

      setHeldOpen(false)

      toast.success(

        held?.heldKind === 'quote' ? 'Cotización restaurada al carrito' : 'Venta restaurada al carrito'

      )

    }

  }



  return (

    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white">

      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 py-4 pl-5 pr-16 lg:pr-5 min-w-0">

        <div className="min-w-0">

          <h2 className="font-heading text-lg font-bold tracking-tight text-slate-900">Carrito Actual</h2>

          <div className="mt-1 flex flex-wrap items-center gap-2">

            <span

              className={cn(

                'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',

                isQuote ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'

              )}

              data-testid="cart-document-kind"

            >

              {isQuote ? <FileText className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}

              {isQuote ? 'Cotización' : 'Factura'}

            </span>

            {!isFinalized && (

              <div className="flex rounded-md bg-slate-100 p-0.5">

                <Tip
                  title="Cuenta abierta"
                  body="Modo cotización: el cliente consume y paga después."
                  side="bottom"
                >
                  <button

                    type="button"

                    onClick={() => setDocumentKind('quote')}

                    data-testid="cart-mode-quote"

                    className={cn(

                      'rounded px-2 py-0.5 text-[10px] font-bold transition-colors',

                      documentKind === 'quote' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-400'

                    )}

                  >

                    Cuenta abierta

                  </button>
                </Tip>

                <Tip
                  title="Venta directa"
                  body="Factura y cobra de inmediato, sin dejar cuenta pendiente."
                  side="bottom"
                >
                  <button

                    type="button"

                    onClick={() => setDocumentKind('invoice')}

                    data-testid="cart-mode-invoice"

                    className={cn(

                      'rounded px-2 py-0.5 text-[10px] font-bold transition-colors',

                      documentKind === 'invoice' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-400'

                    )}

                  >

                    Venta directa

                  </button>
                </Tip>

              </div>

            )}

          </div>

        </div>

        <div className="flex items-center gap-1">

          <Tip
            title="Ventas retenidas"
            body="Cotizaciones guardadas y ventas apartadas para retomarlas después."
            side="bottom"
          >
            <button

              type="button"

              onClick={() => setHeldOpen(true)}

              data-testid="cart-held-toggle"

              className="relative inline-flex items-center justify-center rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50"

            >

              <Clock className="h-5 w-5" />

              {heldCarts.length > 0 && (

                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">

                  {heldCarts.length}

                </span>

              )}

            </button>
          </Tip>

          <Tip
            title="Limpiar carrito"
            body="Quita todos los ítems del carrito actual sin guardar."
            side="bottom"
          >
            <button

              onClick={handleClear}

              data-testid="cart-clear"

              className={cn(

                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',

                empty ? 'text-slate-400' : 'bg-slate-600 text-white hover:bg-slate-700'

              )}

            >

              <Trash2 className="h-3.5 w-3.5" /> Limpiar

            </button>
          </Tip>

        </div>

      </div>



      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto scrollbar-thin p-4">

        <CustomerSelector />

        <CustomerDebtBanner

          debt={customerDebt}

          onCollectQuote={handleCollectQuote}

          onCollectReceivable={handleCollectReceivable}

          onAddQuoteToCart={handleAddQuoteToCart}

          onAddReceivableToCart={handleAddReceivableToCart}

          onAddAllToCart={handleAddAllToCart}

        />



        {empty ? (

          <EmptyState icon={ShoppingCart} title="Carrito vacío" description="Agrega productos o servicios desde la izquierda para iniciar una venta." className="py-10" />

        ) : (

          <div className="min-w-0 space-y-3">

            {isFinalized && (

              <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700" data-testid="cart-finalized-notice">

                Cuenta pedida — la factura ya no es editable. Procede al cobro.

              </p>

            )}

            <AnimatePresence initial={false}>

              {items.map((item) => (

                <CartItem key={item.id} item={item} />

              ))}

            </AnimatePresence>

          </div>

        )}



        {!empty && (

          <>

            <div className="border-t border-slate-100 pt-4">

              <button

                type="button"

                onClick={() => setDiscountOpen((o) => !o)}

                disabled={isFinalized}

                data-testid="cart-discount-toggle"

                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"

              >

                <span className="flex min-w-0 items-center gap-2">

                  <Percent className="h-4 w-4 shrink-0" />

                  Descuento

                  {discountAmt > 0 && (

                    <span className="truncate font-medium text-emerald-600">· −{formatDOP(discountAmt)}</span>

                  )}

                </span>

                <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200', discountOpen && 'rotate-180')} />

              </button>



              <AnimatePresence initial={false}>

                {discountOpen && !isFinalized && (

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

                          <button type="button" onClick={() => setDiscountMode('amount')} data-testid="cart-discount-mode-amount" className={cn('rounded-md px-2.5 py-1 text-xs font-bold transition-colors', discountMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400')}>RD$</button>

                          <button type="button" onClick={() => setDiscountMode('pct')} data-testid="cart-discount-mode-pct" className={cn('rounded-md px-2.5 py-1 text-xs font-bold transition-colors', discountMode === 'pct' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400')}>%</button>

                        </div>

                      </div>

                      <div className="relative">

                        <input type="number" min="0" value={discountValue || ''} onChange={(e) => setDiscountValue(e.target.value)} placeholder="0" data-testid="cart-discount-input" className="w-full rounded-lg border-0 bg-white py-2.5 pl-3 pr-14 text-right text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600" />

                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">{discountMode === 'amount' ? 'RD$' : '%'}</span>

                      </div>

                      {discountAmt > 0 && (

                        <p className="mt-1.5 text-xs font-medium text-emerald-600" data-testid="cart-discount-helper">

                          {discountMode === 'amount' ? `Equivale a ${getDiscountPct().toFixed(1)}% de descuento` : `Ahorro de ${formatDOP(discountAmt)}`}

                        </p>

                      )}

                    </div>

                  </motion.div>

                )}

              </AnimatePresence>

            </div>



            {isInvoice && <PaymentSection error={payError} />}



            <div className="grid grid-cols-2 gap-2">

              <Tip
                title="Retener venta"
                body="Aparta el carrito sin cerrar la venta. No queda como cuenta abierta del cliente."
                side="top"
                className="w-full"
              >
                <button

                  onClick={handleRetain}

                  disabled={empty}

                  data-testid="pos-retain"

                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"

                >

                  <Clock className="h-4 w-4" /> Retener

                </button>
              </Tip>

              {isQuote ? (

                <Tip
                  title="Pedir cuenta"
                  body="Cierra la cuenta abierta y prepara la factura para cobrar."
                  side="top"
                  className="w-full"
                >
                  <button

                    onClick={handleRequestBill}

                    disabled={empty}

                    data-testid="pos-request-bill"

                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"

                  >

                    <Receipt className="h-4 w-4" /> Pedir cuenta

                  </button>
                </Tip>

              ) : (

                <button onClick={handlePrint} data-testid="pos-print" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600">

                  <Printer className="h-4 w-4" /> Imprimir

                </button>

              )}

            </div>



            <div className="grid grid-cols-2 gap-2">

              <button onClick={handleDownload} data-testid="pos-download" className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600">

                <Download className="h-4 w-4" /> Descargar

              </button>

              <button type="button" onClick={toggleExpense} data-testid="pos-expense-toggle" className={cn('flex flex-col items-center gap-1 rounded-xl border py-2.5 text-[11px] font-semibold transition-colors', isExpense ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:text-red-600')}>

                <Wallet className="h-4 w-4" /> Gasto

              </button>

            </div>

          </>

        )}

      </div>



      <div className="min-w-0 shrink-0 space-y-3 overflow-x-hidden border-t border-slate-100 bg-slate-50/70 p-4">

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

            <span className={cn('font-heading text-2xl font-bold tracking-tight', isExpense ? 'text-red-600' : isQuote ? 'text-amber-600' : 'text-blue-600')} data-testid="cart-total">{formatDOP(getTotal())}</span>

          </div>

        </div>



        {isQuote ? (

          <Tip
            title="Guardar cotización"
            body="Guarda la cuenta abierta y aparece en ventas retenidas para retomarla luego."
            side="top"
            className="block w-full"
            wide
          >
            <Button size="lg" className="w-full min-w-0 bg-amber-600 hover:bg-amber-700" onClick={handleSaveQuote} disabled={empty} data-testid="pos-save-quote-btn">

              <FileText className="h-4 w-4" /> Guardar cotización {!empty && `· ${formatDOP(getTotal())}`}

            </Button>
          </Tip>

        ) : (

          <Button size="lg" className="w-full min-w-0" variant={isExpense ? 'dangerSolid' : 'primary'} onClick={handleCheckout} disabled={empty} data-testid="pos-checkout-btn">

            <Wallet className="h-4 w-4" /> {isExpense ? 'Registrar gasto' : 'Cobrar'} {!empty && `· ${formatDOP(getTotal())}`}

          </Button>

        )}

      </div>



      <HeldCartsModal

        open={heldOpen}

        onClose={() => setHeldOpen(false)}

        heldCarts={heldCarts}

        taxPct={taxPct}

        onRestore={restoreHeld}

        onRemove={(id) => {

          removeHeldCart(id)

          toast('Venta retenida eliminada')

        }}

      />



      <ReceivablePaymentModal

        open={!!paymentReceivable}

        onClose={() => setPaymentReceivable(null)}

        receivable={paymentReceivable}

      />

    </div>

  )

}


