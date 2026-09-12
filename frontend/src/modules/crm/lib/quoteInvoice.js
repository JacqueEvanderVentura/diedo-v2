import { paymentMethodApiReference } from '@/services/adapters/pos'
import {
  collectionModeForPaymentMethod,
  isReceivableSettlementMethod,
} from '@/modules/pos/lib/paymentMethods'
import { getBalance, getReceivableStatus } from '@/modules/pos/lib/receivables'

export const QUOTE_INVOICE_PERMISSION = 'pos.sell'

export const PAYMENT_METHODS_CONFIG_HREF = '/configuracion?open=metodos-pago'

export function isQuoteInvoiced(quote) {
  return Boolean(quote?.convertedSaleId || quote?.invoiceNumber)
}

export function canEmitQuoteInvoice(quote) {
  if (!quote || quote.status !== 'aceptada') return false
  if (isQuoteInvoiced(quote)) return false
  const lineCount = quote.items?.length || 0
  const total = Number(quote.total) || 0
  return lineCount > 0 || total > 0
}

export function listCheckoutPaymentMethods(methods) {
  return (methods || []).filter((item) => item.enabled)
}

export { isReceivableSettlementMethod }

export function collectionModeForMethod(method) {
  return collectionModeForPaymentMethod(method)
}

/** Estado de cobro CRM tras emitir factura (no depende de si la CxC ya está en el store). */
export function invoiceCollectionStatusFromMethod(method) {
  if (!method) return 'collected'
  const policy = method.settlementPolicy || method.settlementMode
  if (method.id === 'cxc' || policy === 'receivable' || method.settlementMode === 'credit') {
    return 'receivable'
  }
  if (
    method.id === 'transferencia'
    || method.id === 'link'
    || policy === 'pending_confirmation'
    || method.settlementMode === 'pending_confirmation'
  ) {
    return 'pending_validation'
  }
  return 'collected'
}

export function isQuoteInvoicePendingValidation(quote) {
  if (!isQuoteInvoiced(quote)) return false
  return quote.invoiceCollection === 'pending_validation'
}

export function invoiceCollectionFromSalePolicy(sale) {
  if (!sale) return null
  const policy = sale.settlementPolicy
    || sale.paymentMethod?.settlementPolicy
    || sale.payment_method?.settlement_policy
  if (policy === 'pending_confirmation') return 'pending_validation'
  if (policy === 'receivable') return 'receivable'
  if (policy === 'immediate') return 'collected'
  const method = sale.method
  if (method === 'cxc') return 'receivable'
  if (method === 'transferencia' || method === 'link') return 'pending_validation'
  if (method === 'efectivo' || method === 'tarjeta') return 'collected'
  return null
}

function openReceivableCollectionStatus(receivable) {
  if (!receivable || getBalance(receivable) <= 0) return 'collected'
  const method = receivable.method || receivable.paidMethod
  if (method === 'transferencia' || method === 'link') return 'pending_validation'
  if (method === 'cxc') return 'receivable'
  return 'receivable'
}

export function analyzeQuoteInvoicePaymentSetup(methods, { online = true } = {}) {
  const enabled = listCheckoutPaymentMethods(methods)
  if (!enabled.length) {
    return {
      code: 'no_methods',
      title: 'No hay métodos de pago activos',
      message: 'Activa al menos un método (efectivo, tarjeta, transferencia o cuenta por cobrar) para poder facturar.',
      actionLabel: 'Configurar métodos de pago',
      actionHref: PAYMENT_METHODS_CONFIG_HREF,
    }
  }
  if (online) {
    const synced = enabled.filter((item) => item.apiId)
    if (!synced.length) {
      return {
        code: 'not_synced',
        title: 'Métodos de pago sin cargar en esta sesión',
        message:
          'En Configuración ya existen, pero aquí aún se usa la copia local del navegador sin el ID de la API. '
          + 'Carga los métodos del workspace para poder facturar (no necesitas abrir POS).',
        actionLabel: 'Cargar métodos de pago',
      }
    }
  }
  return null
}

export function resolveQuoteInvoicePaymentMethod(methods, { paymentMethodId, semantic }) {
  const enabled = listCheckoutPaymentMethods(methods)
  let method = enabled.find((item) => item.id === paymentMethodId)
  if (!method && semantic) {
    const payment = paymentMethodApiReference(enabled, semantic)
    method = enabled.find((item) => item.apiId === payment.methodId)
  }
  if (!method) {
    const err = new Error('Selecciona un método de pago.')
    err.code = 'missing_selection'
    throw err
  }
  if (!method.apiId) {
    const err = new Error('Este método no está sincronizado con la API. Configúralo antes de facturar.')
    err.code = 'not_synced'
    throw err
  }
  return {
    methodId: method.apiId,
    collectionMode: collectionModeForMethod(method),
    semantic: method.id,
    method,
  }
}

function saleKey(value) {
  if (value == null || value === '') return null
  return String(value)
}

export function quoteConvertedSaleId(quote, sales = []) {
  const direct = saleKey(quote?.convertedSaleId)
  if (direct) return direct
  const invoice = quote?.invoiceNumber
  if (!invoice) return null
  const sale = (sales || []).find((item) => item.number === invoice)
  return saleKey(sale?.id)
}

export function resolveQuoteBilling(quote, receivables, sales = []) {
  const convertedSaleId = quoteConvertedSaleId(quote, sales) || quote?.convertedSaleId || null
  return enrichQuoteInvoiceCollection({ ...quote, convertedSaleId }, receivables, sales)
}

export function findQuoteReceivable(quote, receivables, sales = []) {
  const receivableId = quote?.receivableId
  if (receivableId) {
    const byId = (receivables || []).find((item) => item.id === receivableId)
    if (byId) return byId
  }
  const saleId = quoteConvertedSaleId(quote, sales)
  if (!saleId) return null
  return (receivables || []).find((item) => saleKey(item.saleId) === saleId) || null
}

export function mergeInvoiceCollection(fromApi, fromPrior) {
  const pending = new Set(['receivable', 'pending_validation'])
  if (pending.has(fromPrior) && fromApi === 'collected') return fromPrior
  return fromApi || fromPrior || null
}

export function enrichQuoteInvoiceCollection(quote, receivables, sales = []) {
  if (!quote || !isQuoteInvoiced(quote)) return quote

  const receivable = findQuoteReceivable(quote, receivables, sales)
  if (receivable && getBalance(receivable) <= 0) {
    return { ...quote, invoiceCollection: 'collected' }
  }

  const saleId = quoteConvertedSaleId(quote, sales)
  const sale = (sales || []).find((item) => saleKey(item.id) === saleId) || null
  const fromSale = invoiceCollectionFromSalePolicy(sale)
  const fromMethod = quote.invoicePaymentMethod
    ? invoiceCollectionStatusFromMethod({ id: quote.invoicePaymentMethod })
    : null
  const fromReceivable = receivable ? openReceivableCollectionStatus(receivable) : null

  let status = quote.invoiceCollection || fromSale || fromMethod || fromReceivable
  if (!status && quote.receivableId) status = 'receivable'
  if (!status) status = 'collected'

  if (receivable && getBalance(receivable) > 0 && status === 'collected') {
    status = fromReceivable || fromMethod || fromSale || 'receivable'
  }
  if (status === 'collected' && (fromMethod === 'pending_validation' || fromMethod === 'receivable')) {
    status = fromMethod
  }
  if (status === 'collected' && (fromSale === 'pending_validation' || fromSale === 'receivable')) {
    status = fromSale
  }

  return { ...quote, invoiceCollection: status }
}

export function quoteExpectsReceivable(quote, receivables) {
  if (!isQuoteInvoiced(quote)) return false
  if (quote.invoiceCollection === 'receivable' || quote.invoiceCollection === 'pending_validation') {
    return true
  }
  if (quote.invoiceCollection === 'collected') return false
  return Boolean(findQuoteReceivable(quote, receivables))
}

export function isQuoteInvoicePending(quote, receivables) {
  if (!isQuoteInvoiced(quote)) return false
  if (isQuoteInvoicePaid(quote, receivables)) return false
  if (quote.invoiceCollection === 'receivable' || quote.invoiceCollection === 'pending_validation') {
    return true
  }
  const receivable = findQuoteReceivable(quote, receivables)
  return Boolean(receivable && getBalance(receivable) > 0)
}

export function isQuoteInvoicePaid(quote, receivables) {
  if (!isQuoteInvoiced(quote)) return false
  const receivable = findQuoteReceivable(quote, receivables)
  if (receivable) return getBalance(receivable) <= 0
  if (quote.invoiceCollection === 'receivable' || quote.invoiceCollection === 'pending_validation') {
    return false
  }
  if (quote.invoiceCollection === 'collected') return true
  if (
    !quote.invoiceCollection
    && !quote.receivableId
    && !quote.invoicePaymentMethod
    && !receivable
  ) {
    return true
  }
  return false
}

export function crmReceivablesFromQuotes(receivables, quotes, sales = []) {
  const quotesBySaleId = new Map()
  for (const quote of quotes || []) {
    const saleId = quoteConvertedSaleId(quote, sales)
    if (saleId) quotesBySaleId.set(saleId, quote)
  }
  if (!quotesBySaleId.size) return []
  return (receivables || [])
    .filter((receivable) => {
      const saleId = saleKey(receivable.saleId)
      return saleId && quotesBySaleId.has(saleId)
    })
    .map((receivable) => {
      const linkedQuote = quotesBySaleId.get(saleKey(receivable.saleId))
      if (!receivable.branchId && linkedQuote?.branchId) {
        return { ...receivable, branchId: linkedQuote.branchId }
      }
      return receivable
    })
}

export function isSyntheticCrmReceivable(row) {
  return Boolean(row?.synthetic) || String(row?.id || '').startsWith('crm-quote-receivable-')
}

export function collectRowForQuote(quote, receivables, sales = []) {
  const linked = findQuoteReceivable(quote, receivables, sales)
  if (linked) return linked
  if (quote?.receivableId) {
    return {
      id: quote.receivableId,
      saleId: quoteConvertedSaleId(quote, sales),
      quoteId: quote.id,
      branchId: quote.branchId,
      customer: { name: quote.customerName },
      amount: Number(quote?.total) || 0,
      paidAmount: 0,
      balance: Number(quote?.total) || 0,
      status: 'pending',
      apiSynced: true,
      reference: quote.invoiceNumber || quote.number,
      payments: [],
    }
  }
  const saleId = quoteConvertedSaleId(quote, sales)
  const total = Number(quote?.total) || 0
  return {
    id: `crm-quote-receivable-${quote.id}`,
    synthetic: true,
    quoteId: quote.id,
    saleId,
    branchId: quote.branchId,
    customer: { name: quote.customerName },
    amount: total,
    paidAmount: 0,
    balance: total,
    status: 'pending',
    apiSynced: true,
    reference: quote.invoiceNumber || quote.number,
    payments: [],
  }
}

export function listCrmOpenReceivables(receivables, quotes, sales = []) {
  const linked = crmReceivablesFromQuotes(receivables, quotes, sales).filter(
    (item) => getBalance(item) > 0
  )
  const linkedSaleIds = new Set(linked.map((item) => saleKey(item.saleId)).filter(Boolean))
  const pendingQuotes = (quotes || []).filter((quote) => {
    if (!isQuoteInvoicePending(quote, receivables)) return false
    const saleId = quoteConvertedSaleId(quote, sales)
    if (!saleId) return true
    return !linkedSaleIds.has(saleId)
  })
  const synthetic = pendingQuotes.map((quote) => ({
    id: `crm-quote-receivable-${quote.id}`,
    synthetic: true,
    quoteId: quote.id,
    saleId: quoteConvertedSaleId(quote, sales),
    branchId: quote.branchId,
    customer: { name: quote.customerName },
    amount: Number(quote.total) || 0,
    paidAmount: 0,
    balance: Number(quote.total) || 0,
    status: 'pending',
    apiSynced: true,
    reference: quote.invoiceNumber || quote.number,
    payments: [],
  }))
  return [...linked, ...synthetic]
}
