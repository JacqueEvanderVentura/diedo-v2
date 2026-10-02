import {
  findQuoteReceivable,
  isSyntheticCrmReceivable,
  quoteConvertedSaleId,
} from '@/modules/crm/lib/quoteInvoice'

function matchReceivableInList(list, { receivableIdHint, quote, saleId, sales }) {
  let found = receivableIdHint
    ? list.find((item) => String(item.id) === String(receivableIdHint))
    : null
  if (!found && quote) {
    found = findQuoteReceivable(quote, list, sales)
  }
  if (!found && saleId) {
    found = list.find((item) => String(item.saleId) === String(saleId)) || null
  }
  return found || null
}

/**
 * Resuelve la CxC real de una fila de cobro CRM (incluye stubs y IDs obsoletos).
 */
export async function resolveQuoteReceivableForCollect({
  row,
  quote = null,
  sales = [],
  receivables = [],
  isOnline = false,
  ensureReceivableDetail,
  listAllReceivables,
  getReceivableForSale,
}) {
  const saleId = quoteConvertedSaleId(quote || {}, sales) || row?.saleId || null
  const receivableIdHint = quote?.receivableId
    || (!isSyntheticCrmReceivable(row) && row?.id ? row.id : null)

  let found = matchReceivableInList(receivables, {
    receivableIdHint,
    quote,
    saleId,
    sales,
  })

  if (!found && listAllReceivables) {
    const allItems = await listAllReceivables()
    found = matchReceivableInList(allItems, {
      receivableIdHint,
      quote,
      saleId,
      sales,
    })
  }

  if (!found?.id && saleId && isOnline && getReceivableForSale) {
    try {
      found = await getReceivableForSale(saleId)
    } catch {
      found = found || null
    }
  }

  if (!found?.id && receivableIdHint && isOnline && ensureReceivableDetail) {
    try {
      found = await ensureReceivableDetail(receivableIdHint)
    } catch {
      found = null
    }
  }

  if (!found?.id) return null

  if (isOnline && ensureReceivableDetail && found.id && !found.detailLoaded) {
    try {
      return await ensureReceivableDetail(found.id) || found
    } catch {
      return found
    }
  }

  return found
}
