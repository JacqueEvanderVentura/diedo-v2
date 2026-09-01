import { FileText, Receipt, Wallet } from 'lucide-react'
import { formatDOP } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Tip } from '@/components/ui/Tip'

function BannerActions({ primary, secondary }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {primary}
      {secondary}
    </div>
  )
}

function QuoteSection({ debt, onCollectQuote, onAddQuoteToCart, collectDisabled, manageDisabled }) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-xl border border-sky-200 bg-sky-50 p-3.5"
      data-testid="customer-quote-banner"
    >
      <div className="flex items-start gap-2.5">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-800">Cuenta abierta</p>
          <p className="mt-0.5 font-heading text-lg font-bold text-sky-900">
            {formatDOP(debt.quoteTotal)}
          </p>
          <p className="mt-1 text-xs text-sky-700">
            Cotización pendiente · {debt.quoteItemCount} ítem{debt.quoteItemCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <BannerActions
        primary={
          <Tip
            title="Pedir cuenta"
            body="Carga la cotización y pasa a factura para cobrar el total."
            side="bottom"
          >
            <Button
              size="sm"
              variant="secondary"
              className="w-full border-sky-300 bg-white text-sky-900 hover:bg-sky-100"
              onClick={onCollectQuote}
              disabled={collectDisabled}
              data-testid="customer-quote-collect"
            >
              Pedir cuenta
            </Button>
          </Tip>
        }
        secondary={
          <Tip
            title="Agregar cotización"
            body="Mete los ítems de la cuenta abierta en el carrito actual."
            side="bottom"
          >
            <Button
              size="sm"
              className="w-full bg-sky-600 hover:bg-sky-700"
              onClick={onAddQuoteToCart}
              disabled={manageDisabled}
              data-testid="customer-quote-add-cart"
            >
              Al carrito ({debt.quoteItemCount})
            </Button>
          </Tip>
        }
      />
    </div>
  )
}

function ReceivableSection({ debt, onCollectReceivable, onAddReceivableToCart, disabled }) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 p-3.5"
      data-testid="customer-receivable-banner"
    >
      <div className="flex items-start gap-2.5">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Saldo por cobrar</p>
          <p className="mt-0.5 font-heading text-lg font-bold text-amber-900">
            {formatDOP(debt.receivableBalance)}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Cuenta por cobrar · {debt.receivableItemCount} ítem
            {debt.receivableItemCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <BannerActions
        primary={
          <Tip
            title="Registrar pago"
            body="Abre el cobro del saldo pendiente en CxC."
            side="bottom"
          >
            <Button
              size="sm"
              variant="secondary"
              className="w-full border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
              onClick={onCollectReceivable}
              disabled={disabled}
              data-testid="customer-receivable-collect"
            >
              Registrar pago
            </Button>
          </Tip>
        }
        secondary={
          <Tip
            title="Agregar saldo"
            body="Añade el saldo CxC como líneas en el carrito."
            side="bottom"
          >
            <Button
              size="sm"
              className="w-full bg-amber-600 hover:bg-amber-700"
              onClick={onAddReceivableToCart}
              disabled={disabled}
              data-testid="customer-receivable-add-cart"
            >
              Al carrito ({debt.receivableItemCount})
            </Button>
          </Tip>
        }
      />
    </div>
  )
}

export function CustomerDebtBanner({
  debt,
  onCollectQuote,
  onCollectReceivable,
  onAddQuoteToCart,
  onAddReceivableToCart,
  onAddAllToCart,
  canManageQuote = true,
  canCollectQuote = true,
  canCollectReceivable = true,
}) {
  if (!debt) return null

  const hasQuote = debt.quoteTotal > 0
  const hasCxC = debt.receivableBalance > 0
  if (!hasQuote && !hasCxC) return null

  if (hasQuote && !hasCxC) {
    return (
      <QuoteSection
        debt={debt}
        onCollectQuote={onCollectQuote}
        onAddQuoteToCart={onAddQuoteToCart}
        collectDisabled={!canCollectQuote}
        manageDisabled={!canManageQuote}
      />
    )
  }

  if (hasCxC && !hasQuote) {
    return (
      <ReceivableSection
        debt={debt}
        onCollectReceivable={onCollectReceivable}
        onAddReceivableToCart={onAddReceivableToCart}
        disabled={!canCollectReceivable}
      />
    )
  }

  return (
    <div className="min-w-0 space-y-2 overflow-hidden" data-testid="customer-debt-banner">
      <div className="flex items-center gap-2 px-0.5">
        <Receipt className="h-3.5 w-3.5 text-slate-400" />
        <p className="text-xs font-semibold text-slate-600">Pendientes del cliente</p>
      </div>
      <QuoteSection
        debt={debt}
        onCollectQuote={onCollectQuote}
        onAddQuoteToCart={onAddQuoteToCart}
        collectDisabled={!canCollectQuote}
        manageDisabled={!canManageQuote}
      />
      <ReceivableSection
        debt={debt}
        onCollectReceivable={onCollectReceivable}
        onAddReceivableToCart={onAddReceivableToCart}
        disabled={!canCollectReceivable}
      />
      <Tip
        title="Agregar todo"
        body="Une la cotización y el saldo CxC en un solo carrito."
        side="bottom"
        className="w-full"
      >
        <Button
          size="sm"
          variant="secondary"
          className="w-full border-slate-200"
          onClick={onAddAllToCart}
          disabled={!canManageQuote || !canCollectReceivable}
          data-testid="customer-debt-add-all"
        >
          Agregar todo al carrito ({debt.itemCount})
        </Button>
      </Tip>
    </div>
  )
}
