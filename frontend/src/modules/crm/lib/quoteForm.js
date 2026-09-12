export function emptyQuoteLine() {
  return { itemId: '', qty: 1, price: '' }
}

export function emptyQuoteDraft() {
  return {
    customerId: '',
    opportunityId: '',
    branchId: '',
    lines: [emptyQuoteLine()],
  }
}

export function draftFromQuote(quote) {
  return {
    customerId: quote.customerId || '',
    opportunityId: quote.opportunityId || '',
    branchId: quote.branchId || '',
    lines: (quote.items?.length ? quote.items : [emptyQuoteLine()]).map((item) => ({
      itemId: item.itemId || item.id || '',
      qty: item.qty || 1,
      price: item.price != null ? String(item.price) : '',
    })),
  }
}

export function draftFromOpportunity(opportunity) {
  return {
    customerId: opportunity.customerId || '',
    opportunityId: opportunity.id,
    branchId: opportunity.branchId || '',
    lines: [emptyQuoteLine()],
  }
}

export function quoteLinesToItems(lines, catalogById) {
  return lines
    .filter((line) => line.itemId)
    .map((line) => {
      const product = catalogById.get(line.itemId)
      const qty = Math.max(1, Number(line.qty) || 1)
      const price = Number(line.price) || Number(product?.price) || 0
      return {
        id: line.itemId,
        itemId: line.itemId,
        name: product?.name || 'Ítem',
        qty,
        price,
      }
    })
}

export function isQuoteEditable(quote) {
  if (!quote) return true
  if (quote.convertedSaleId || quote.invoiceNumber) return false
  return ['borrador', 'enviada'].includes(quote.status)
}

export const QUOTE_EDITABLE_STATUSES = ['borrador', 'enviada']
