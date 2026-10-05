import { makeInvoiceId } from '@/modules/pos/lib/invoice'
import { paymentMethodApiReference } from '@/services/adapters/pos'
import { isActiveCrmQuote } from '@/modules/crm/lib/crmQuoteVisibility'

export const PIPELINE_INVOICE_PERMISSION = 'pos.sell'

const BILLABLE_STATUSES = ['aceptada', 'enviada', 'borrador']

/** Latest active quote linked to a pipeline lead (for view / duplicate guard). */
export function findLeadLinkedQuote(quotes, leadId) {
  if (!leadId) return null
  const linked = (quotes || [])
    .filter((quote) => quote.leadId === leadId && isActiveCrmQuote(quote))
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))
  return linked[0] || null
}

export function findBillableQuote(quotes, leadId) {
  const scoped = (quotes || []).filter((quote) => quote.leadId === leadId && quote.items?.length)
  if (!scoped.length) return null
  const invoiced = scoped.find((quote) => quote.convertedSaleId)
  if (invoiced) return invoiced
  const ranked = [...scoped].sort((left, right) => {
    const leftRank = BILLABLE_STATUSES.indexOf(left.status)
    const rightRank = BILLABLE_STATUSES.indexOf(right.status)
    return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank)
  })
  return ranked.find((quote) => BILLABLE_STATUSES.includes(quote.status)) || null
}

export function validatePipelineClose({ lead, quotes }) {
  if (!lead) return 'Lead no encontrado.'
  if (!lead.customerId) return 'Vincula un cliente antes de cerrar el lead.'
  const quote = findBillableQuote(quotes, lead.id)
  if (!quote) return 'Crea una cotización con ítems antes de cerrar el lead.'
  if (!quote.items?.length) return 'La cotización debe incluir al menos un ítem.'
  return null
}

export function previewInvoiceNumber(date = new Date()) {
  return makeInvoiceId(date, 'sale')
}

export function sumQuoteLines(items = []) {
  return items.reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.qty) || 1), 0)
}

export function buildDemoSaleFromPipeline({ lead, quote, customer, paymentMethod = 'efectivo' }) {
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
  const displayName = lead?.company || lead?.name || quote.customerName

  return {
    id: `sale-${Date.now().toString(36)}`,
    number: previewInvoiceNumber(new Date(createdAt)),
    branchId: lead.branchId,
    customer: customer
      ? { id: customer.id, name: customer.name, phone: customer.phone || null }
      : { id: null, name: displayName, phone: null },
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
    leadId: lead.id,
    quoteId: quote.id,
    createdAt,
    detailLoaded: true,
    source: 'demo',
  }
}

export function buildPipelineCheckoutPayload({
  quote,
  lead,
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

