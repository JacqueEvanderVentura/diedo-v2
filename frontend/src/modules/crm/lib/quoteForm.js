let lineKeyCounter = 0

export function nextQuoteLineKey() {
  lineKeyCounter += 1
  return `ql-${Date.now()}-${lineKeyCounter}`
}

export function isQuoteSectionLine(line) {
  return line?.kind === 'section'
}

export function isQuoteProductLine(line) {
  return !isQuoteSectionLine(line)
}

export function emptyQuoteLine() {
  return { key: nextQuoteLineKey(), kind: 'item', itemId: '', qty: 1, price: '' }
}

export function emptyQuoteSection() {
  return { key: nextQuoteLineKey(), kind: 'section', title: '' }
}

export function emptyQuoteDraft() {
  return {
    customerId: '',
    leadId: '',
    partyType: '',
    branchId: '',
    lines: [emptyQuoteLine()],
  }
}

function mapQuoteItemToDraftLine(item) {
  if (item?.kind === 'section' || item?.lineKind === 'section') {
    return {
      key: item.id || item.key || nextQuoteLineKey(),
      kind: 'section',
      title: item.title || item.name || '',
    }
  }
  return {
    key: item.id || item.key || nextQuoteLineKey(),
    kind: 'item',
    itemId: item.itemId || item.id || '',
    qty: item.qty || 1,
    price: item.price != null ? String(item.price) : '',
  }
}

export function draftFromQuote(quote) {
  return {
    customerId: quote.customerId || '',
    leadId: quote.leadId || '',
    partyType: quote.leadId ? 'lead' : (quote.customerId ? 'customer' : ''),
    branchId: quote.branchId || '',
    lines: (quote.items?.length ? quote.items : [emptyQuoteLine()]).map(mapQuoteItemToDraftLine),
  }
}

export function draftFromLead(lead) {
  return {
    customerId: lead.customerId || '',
    leadId: lead.id,
    partyType: 'lead',
    branchId: lead.branchId || '',
    lines: [emptyQuoteLine()],
  }
}

export function quoteLinesToItems(lines, catalogById) {
  return lines
    .map((line) => {
      if (isQuoteSectionLine(line)) {
        const title = String(line.title || '').trim()
        if (!title) return null
        return {
          id: line.key,
          key: line.key,
          kind: 'section',
          title,
          name: title,
          qty: 0,
          price: 0,
        }
      }
      if (!line.itemId) return null
      const product = catalogById.get(line.itemId)
      const qty = Math.max(1, Number(line.qty) || 1)
      const price = Number(line.price) || Number(product?.price) || 0
      return {
        id: line.key,
        key: line.key,
        kind: 'item',
        itemId: line.itemId,
        name: product?.name || 'Ítem',
        qty,
        price,
      }
    })
    .filter(Boolean)
}

export function countQuoteProductLines(items = []) {
  return items.filter((item) => item.kind !== 'section').length
}

export function hasQuoteSections(lines = []) {
  return lines.some((line) => isQuoteSectionLine(line))
}

export function isQuoteEditable(quote) {
  if (!quote) return true
  if (quote.convertedSaleId || quote.invoiceNumber) return false
  return ['borrador', 'enviada'].includes(quote.status)
}

export const QUOTE_EDITABLE_STATUSES = ['borrador', 'enviada']
