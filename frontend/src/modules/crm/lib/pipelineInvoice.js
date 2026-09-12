import { makeInvoiceId } from '@/modules/pos/lib/invoice'
import { paymentMethodApiReference } from '@/services/adapters/pos'

export const PIPELINE_INVOICE_PERMISSION = 'pos.sell'

const BILLABLE_STATUSES = ['aceptada', 'enviada', 'borrador']

export function findBillableQuote(quotes, opportunityId) {
  const scoped = (quotes || []).filter((quote) => quote.opportunityId === opportunityId && quote.items?.length)
  if (!scoped.length) return null
  const ranked = [...scoped].sort((left, right) => {
    const leftRank = BILLABLE_STATUSES.indexOf(left.status)
    const rightRank = BILLABLE_STATUSES.indexOf(right.status)
    return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank)
  })
  return ranked.find((quote) => quote.status !== 'rechazada' && quote.status !== 'vencida') || ranked[0]
}

export function validatePipelineClose({ opportunity, quotes }) {
  if (!opportunity) return 'Oportunidad no encontrada.'
  if (!opportunity.customerId) return 'Vincula un cliente antes de cerrar la oportunidad.'
  const quote = findBillableQuote(quotes, opportunity.id)
  if (!quote) return 'Crea una cotización con ítems antes de cerrar la oportunidad.'
  if (!quote.items?.length) return 'La cotización debe incluir al menos un ítem.'
  return null
}

export function previewInvoiceNumber(date = new Date()) {
  return makeInvoiceId(date, 'sale')
}

export function sumQuoteLines(items = []) {
  return items.reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.qty) || 1), 0)
}

export function buildDemoSaleFromPipeline({ opportunity, quote, customer, paymentMethod = 'efectivo' }) {
  const items = (quote.items || []).map((item) => ({
    ...item,
    qty: item.qty || 1,
    price: Number(item.price) || 0,
    listPrice: Number(item.listPrice ?? item.price) || 0,
  }))
  const subtotal = sumQuoteLines(items)
  const taxPct = 18
  const taxAmt = Math.round(subtotal * taxPct) / 100
  const total = quote.total || subtotal + taxAmt
  const createdAt = new Date().toISOString()

  return {
    id: `sale-${Date.now().toString(36)}`,
    number: previewInvoiceNumber(new Date(createdAt)),
    branchId: opportunity.branchId,
    customer: customer
      ? { id: customer.id, name: customer.name, phone: customer.phone || null }
      : { id: null, name: opportunity.customerName, phone: null },
    items,
    subtotal,
    discountAmt: 0,
    discountPct: 0,
    taxPct,
    taxAmt,
    total,
    method: paymentMethod,
    reference: quote.number || null,
    status: 'posted',
    channel: 'crm',
    origin: 'pipeline',
    opportunityId: opportunity.id,
    quoteId: quote.id,
    createdAt,
    detailLoaded: true,
    source: 'demo',
  }
}

export function buildPipelineCheckoutPayload({
  quote,
  opportunity,
  customer,
  branchId,
  registerId,
  paymentMethods,
  method = 'efectivo',
}) {
  const payment = paymentMethodApiReference(paymentMethods, method)
  if (!payment.methodId) {
    throw new Error('Selecciona un método de pago sincronizado con la API.')
  }
  if (!registerId) {
    throw new Error('No hay una caja abierta en esta sucursal.')
  }
  const lines = (quote.items || []).map((item) => {
    const itemId = item.itemId || item.id
    if (!itemId) {
      throw new Error('La cotización contiene ítems sin identificador de catálogo.')
    }
    return {
      itemId,
      quantity: item.qty || 1,
      unitPrice: Number(item.price) || 0,
    }
  })
  return {
    branchId,
    registerId,
    customerId: customer?.id && customer.id !== 'walk-in' ? customer.id : null,
    quoteId: quote.id,
    quoteVersion: quote.version,
    paymentMethodId: payment.methodId,
    reference: quote.number || null,
    lines,
  }
}
