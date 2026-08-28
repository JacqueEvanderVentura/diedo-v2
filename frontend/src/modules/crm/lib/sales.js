import {
  buildInvoiceHtml,
  downloadInvoicePdf,
  formatInvoiceDate,
  invoiceFilename,
  printInvoice,
} from '@/modules/pos/lib/invoice'

export function buildInvoiceDataFromSale(sale, { branches = [], settings = {}, paymentMethods = [] } = {}) {
  const branch = branches.find((b) => b.id === sale.branchId)
  const pmName = paymentMethods.find((m) => m.id === sale.method)?.name || sale.method

  const items = (sale.items || []).map((i) => ({
    ...i,
    qty: i.qty || 1,
    price: Number(i.price) || 0,
    listPrice: Number(i.listPrice ?? i.price) || 0,
  }))

  const subtotal = sale.subtotal ?? items.reduce((a, i) => a + i.price * i.qty, 0)
  const discountAmt = sale.discountAmt ?? 0
  const taxPct = sale.taxPct ?? 18
  const taxAmt = sale.taxAmt ?? Math.max(0, ((subtotal - discountAmt) * taxPct) / 100)

  return {
    id: String(sale.id).toUpperCase(),
    kind: 'sale',
    issuedAt: formatInvoiceDate(new Date(sale.createdAt)),
    businessName: settings.businessName || 'Diedo App',
    branchName: branch?.name || '',
    region: settings.region || '',
    customerName: sale.customer?.name || 'Cliente Mostrador',
    customerPhone: sale.customer?.phone || '',
    paymentMethod: pmName,
    paymentReference: sale.reference || '',
    items,
    subtotal,
    discountAmt,
    discountPct: sale.discountPct ?? 0,
    taxPct,
    taxAmt,
    total: sale.total,
  }
}

export function printSaleInvoice(sale, ctx) {
  const data = buildInvoiceDataFromSale(sale, ctx)
  printInvoice(buildInvoiceHtml(data))
}

export function downloadSaleInvoicePdf(sale, ctx) {
  const data = buildInvoiceDataFromSale(sale, ctx)
  downloadInvoicePdf(data, invoiceFilename(data.id))
}
