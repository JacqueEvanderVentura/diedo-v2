import {
  buildInvoiceHtml,
  downloadInvoicePdf,
  formatInvoiceDate,
  invoiceFilename,
  printInvoice,
} from '@/modules/pos/lib/invoice'
import { applyBillingBrandingToInvoiceData } from '@/modules/configuracion/lib/billingDocuments'

function normalizeLineItems(items = []) {
  return items.map((item) => ({
    ...item,
    qty: item.qty || 1,
    price: Number(item.price) || 0,
    listPrice: Number(item.listPrice ?? item.price) || 0,
  }))
}

function sumLines(items) {
  return items.reduce((total, item) => total + item.price * item.qty, 0)
}

function resolveTax(subtotal, discountAmt, taxPct, taxAmt, total) {
  if (taxAmt != null && Number.isFinite(Number(taxAmt))) {
    return Number(taxAmt)
  }
  if (total != null && Number.isFinite(Number(total))) {
    return Math.max(0, Number(total) - (subtotal - discountAmt))
  }
  return Math.max(0, ((subtotal - discountAmt) * taxPct) / 100)
}

export function buildInvoiceDataFromSale(sale, { branches = [], settings = {}, paymentMethods = [], customers = [] } = {}) {
  const branch = branches.find((b) => b.id === sale.branchId)
  const pmName = paymentMethods.find((m) => m.id === sale.method)?.name || sale.method

  const items = normalizeLineItems(sale.items)
  const subtotal = sale.subtotal ?? sumLines(items)
  const discountAmt = sale.discountAmt ?? 0
  const taxPct = sale.taxPct ?? 18
  const taxAmt = resolveTax(subtotal, discountAmt, taxPct, sale.taxAmt, sale.total)
  const discountPct = sale.discountPct ?? (subtotal > 0 ? (discountAmt / subtotal) * 100 : 0)

  const base = {
    id: sale.number || String(sale.id).toUpperCase(),
    kind: 'sale',
    issuedAt: formatInvoiceDate(new Date(sale.createdAt)),
    branchName: branch?.name || sale.branchName || '',
    region: settings.region || '',
    customerId: sale.customer?.id || null,
    customerRecord: sale.customer,
    customerName: sale.customer?.name || 'Cliente Mostrador',
    customerPhone: sale.customer?.phone || '',
    paymentMethod: pmName,
    paymentReference: sale.reference || '',
    items,
    subtotal,
    discountAmt,
    discountPct,
    taxPct,
    taxAmt,
    total: sale.total ?? subtotal - discountAmt + taxAmt,
  }
  return applyBillingBrandingToInvoiceData(base, settings, customers)
}

export function buildInvoiceDataFromQuote(quote, { branches = [], settings = {}, customers = [] } = {}) {
  const branch = branches.find((b) => b.id === quote.branchId)
  const customer = customers.find((c) => c.id === quote.customerId)
  const items = normalizeLineItems(quote.items)
  const subtotal = sumLines(items) || Number(quote.total) || 0
  const discountAmt = quote.discountAmt ?? 0
  const taxPct = quote.taxPct ?? settings.defaultTaxPct ?? 18
  const taxAmt = resolveTax(subtotal, discountAmt, taxPct, quote.taxAmt, quote.total)
  const discountPct = quote.discountPct ?? (subtotal > 0 ? (discountAmt / subtotal) * 100 : 0)

  const base = {
    id: quote.number || `COT-${String(quote.id || '').toUpperCase()}`,
    kind: 'quote',
    issuedAt: formatInvoiceDate(new Date(quote.createdAt || Date.now())),
    validUntil: quote.validUntil ? formatInvoiceDate(new Date(quote.validUntil)) : '',
    branchName: branch?.name || '',
    region: settings.region || '',
    customerId: quote.customerId || customer?.id || null,
    customerRecord: customer,
    customerName: quote.customerName || customer?.name || 'Cliente',
    customerPhone: customer?.phone || '',
    paymentMethod: 'Pendiente de pago',
    paymentReference: '',
    items,
    subtotal,
    discountAmt,
    discountPct,
    taxPct,
    taxAmt,
    total: quote.total ?? subtotal - discountAmt + taxAmt,
  }
  return applyBillingBrandingToInvoiceData(base, settings, customers)
}

export function printSaleInvoice(sale, ctx) {
  const data = buildInvoiceDataFromSale(sale, ctx)
  printInvoice(buildInvoiceHtml(data))
}

export async function downloadSaleInvoicePdf(sale, ctx) {
  const data = buildInvoiceDataFromSale(sale, ctx)
  await downloadInvoicePdf(data, invoiceFilename(data.id))
}

export function printQuoteDocument(quote, ctx) {
  const data = buildInvoiceDataFromQuote(quote, ctx)
  printInvoice(buildInvoiceHtml(data))
}

export async function downloadQuotePdf(quote, ctx) {
  const data = buildInvoiceDataFromQuote(quote, ctx)
  await downloadInvoicePdf(data, invoiceFilename(data.id))
}
