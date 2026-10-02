export function buildQuoteRevisionSnapshot(quote) {
  return {
    number: quote.number,
    crmStatus: quote.status,
    customerName: quote.customerName,
    notes: quote.notes || null,
    subtotal: String(quote.subtotal ?? quote.total ?? 0),
    discountAmount: String(quote.discountAmount ?? 0),
    taxAmount: String(quote.taxAmount ?? 0),
    total: String(quote.total ?? 0),
    dueAt: quote.validUntil || null,
    invoiceNumber: quote.invoiceNumber || null,
    lines: (quote.items || []).map((item) => ({
      name: item.name,
      qty: String(item.qty ?? 1),
      unitPrice: String(item.price ?? 0),
      lineTotal: String((Number(item.qty) || 1) * (Number(item.price) || 0)),
    })),
  }
}

export function appendQuoteRevision(quote, event, occurredAt = new Date().toISOString()) {
  const revisions = [...(quote.revisions || [])]
  revisions.push({
    revision: revisions.length + 1,
    event,
    occurredAt,
    snapshot: buildQuoteRevisionSnapshot(quote),
  })
  return revisions
}

export const QUOTE_REVISION_EVENT_LABELS = {
  created: 'Creada',
  updated: 'Editada',
  invoiced: 'Facturada',
  cancelled: 'Cancelada',
}
