import { isQuoteInvoiced, resolveQuoteBilling } from '@/modules/crm/lib/quoteInvoice'
import { mergeCrmSalesLists, saleDisplayReference } from '@/modules/crm/lib/crmSales'
import { findReceivableForSale } from '@/modules/crm/lib/saleProofs'
import { saleReceivablePending } from '@/modules/crm/lib/crm'

export const CRM_DOC_TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'quotes', label: 'Cotizaciones' },
  { id: 'invoices', label: 'Facturas' },
]

export function parseDocFilter(raw) {
  const value = String(raw || 'all').toLowerCase()
  if (value === 'quotes' || value === 'cotizaciones') return 'quotes'
  if (value === 'invoices' || value === 'facturas') return 'invoices'
  return 'all'
}

export function buildCrmDocumentRows({
  quotes = [],
  crmSales = [],
  posSales = [],
  receivables = [],
}) {
  const sales = mergeCrmSalesLists(posSales, crmSales)
  const enrichedQuotes = quotes.map((quote) => resolveQuoteBilling(quote, receivables, sales))

  const quoteRows = enrichedQuotes
    .filter((quote) => !isQuoteInvoiced(quote))
    .map((quote) => ({
      kind: 'quote',
      id: `quote-${quote.id}`,
      quote,
      sortAt: quote.createdAt || quote.updatedAt || '',
      branchId: quote.branchId || '',
      label: quote.number || '',
      customerName: quote.customerName || '—',
      total: Number(quote.total) || 0,
    }))

  const invoiceRows = sales.map((sale) => {
    const receivable = findReceivableForSale(receivables, sale.id)
    return {
      kind: 'invoice',
      id: `sale-${sale.id}`,
      sale,
      receivable,
      pendingCxc: saleReceivablePending(sale, receivable),
      sortAt: sale.createdAt || '',
      branchId: sale.branchId || '',
      label: sale.number || saleDisplayReference(sale),
      customerName: sale.customer?.name || 'Cliente Mostrador',
      total: Number(sale.total) || 0,
    }
  })

  return [...quoteRows, ...invoiceRows].sort(
    (left, right) => new Date(right.sortAt) - new Date(left.sortAt),
  )
}

export function filterDocumentRows(rows, docFilter) {
  const filter = parseDocFilter(docFilter)
  if (filter === 'quotes') return rows.filter((row) => row.kind === 'quote')
  if (filter === 'invoices') return rows.filter((row) => row.kind === 'invoice')
  return rows
}

export function documentRowTypeLabel(row) {
  return row?.kind === 'invoice' ? 'Factura' : 'Cotización'
}
