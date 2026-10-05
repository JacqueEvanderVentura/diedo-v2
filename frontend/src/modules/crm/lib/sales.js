import {
  buildInvoiceHtml,
  downloadInvoicePdf,
  formatInvoiceDate,
  invoiceFilename,
  printInvoice,
} from '@/modules/pos/lib/invoice'
import { applyBillingBrandingToInvoiceData } from '@/modules/configuracion/lib/billingDocuments'
import { ensureWorkspaceBillingSettings } from '@/modules/configuracion/lib/workspaceSettings'
import { getBalance, getPaidAmount } from '@/modules/pos/lib/receivables'

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

export function buildInvoiceDataFromSale(sale, { branches = [], settings = {}, paymentMethods = [], customers = [], receivable = null } = {}) {
  const branch = branches.find((b) => b.id === sale.branchId)
  const pmName = paymentMethods.find((m) => m.id === sale.method)?.name || sale.method
  const paidAmount = receivable ? getPaidAmount(receivable) : Number(sale.paidAmount) || 0
  const balanceDue = receivable ? getBalance(receivable) : null

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
    paidAmount,
    balanceDue,
  }
  return applyBillingBrandingToInvoiceData(base, settings, customers, branch)
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
  return applyBillingBrandingToInvoiceData(base, settings, customers, branch)
}

export async function printSaleInvoice(sale, ctx) {
  const settings = await ensureWorkspaceBillingSettings(ctx?.settings)
  const data = buildInvoiceDataFromSale(sale, { ...ctx, settings })
  printInvoice(buildInvoiceHtml(data))
}

export async function downloadSaleInvoicePdf(sale, ctx) {
  const settings = await ensureWorkspaceBillingSettings(ctx?.settings)
  const data = buildInvoiceDataFromSale(sale, { ...ctx, settings })
  await downloadInvoicePdf(data, invoiceFilename(data.id))
}

export async function printQuoteDocument(quote, ctx) {
  const settings = await ensureWorkspaceBillingSettings(ctx?.settings)
  const data = buildInvoiceDataFromQuote(quote, { ...ctx, settings })
  printInvoice(buildInvoiceHtml(data))
}

export async function downloadQuotePdf(quote, ctx) {
  const settings = await ensureWorkspaceBillingSettings(ctx?.settings)
  const data = buildInvoiceDataFromQuote(quote, { ...ctx, settings })
  await downloadInvoicePdf(data, invoiceFilename(data.id))
}
