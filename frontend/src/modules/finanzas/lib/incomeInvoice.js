import {
  downloadInvoicePdf,
  formatInvoiceDate,
  invoiceFilename,
  makeInvoiceId,
  printInvoice,
} from '@/modules/pos/lib/invoice'
import { applyBillingBrandingToInvoiceData } from '@/modules/configuracion/lib/billingDocuments'
import { ensureWorkspaceBillingSettings } from '@/modules/configuracion/lib/workspaceSettings'
import { downloadSaleInvoicePdf, printSaleInvoice } from '@/modules/crm/lib/sales'
import { mapSaleFromApi } from '@/services/adapters/pos'
import { financeApi } from '@/services/financeApi'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'
import { incomeCategoryLabel } from './incomeCategory'

export function isPosIncome(income) {
  return income?.origin === 'pos'
}

export function canIncomeInvoice(income) {
  return income?.origin === 'pos' || income?.origin === 'manual'
}

function parseIncomeDate(value) {
  if (!value) return new Date()
  if (typeof value === 'string' && value.length === 10) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export function buildInvoiceDataFromManualIncome(
  income,
  { branches = [], settings = {}, paymentMethods = [], customers = [] } = {},
) {
  const branch = branches.find((b) => b.id === income.branchId)
  const amount = Number(income.amount) || 0
  const lineName = (income.concept || '').trim()
    || incomeCategoryLabel(income.category, paymentMethods)
  const issuedAt = parseIncomeDate(income.date)
  const paid = income.status === 'pagado'
  const customerName = (income.customer || '').trim() || 'Cliente'
  const customerRecord = customers.find(
    (customer) => customer.name?.trim() === customerName
  ) || null

  const base = {
    id: makeInvoiceId(issuedAt, 'sale').replace(/^FAC-/, 'ING-'),
    kind: 'sale',
    issuedAt: formatInvoiceDate(issuedAt),
    branchName: branch?.name || '',
    region: settings.region || '',
    customerId: customerRecord?.id || null,
    customerRecord,
    customerName,
    customerPhone: customerRecord?.phone || '',
    paymentMethod: incomeCategoryLabel(income.category, paymentMethods),
    paymentReference: '',
    items: [{ name: lineName, qty: 1, price: amount, listPrice: amount }],
    subtotal: amount,
    discountAmt: 0,
    discountPct: 0,
    taxPct: 0,
    taxAmt: 0,
    total: amount,
    paidAmount: paid ? amount : 0,
    balanceDue: paid ? 0 : amount,
  }
  return applyBillingBrandingToInvoiceData(base, settings, customers, branch)
}

export async function resolveSaleForIncomeInvoice(saleId) {
  const sale = usePosStore.getState().sales.find((item) => item.id === saleId)
  if (sale?.items?.length || sale?.detailLoaded) return sale
  if (useSessionStore.getState().status === 'online') {
    const response = await financeApi.getIncomeSale(saleId)
    return mapSaleFromApi(response)
  }
  if (!sale) throw new Error('No se encontró la venta asociada a este ingreso.')
  return sale
}

export async function printIncomeInvoice(income, ctx) {
  if (!canIncomeInvoice(income)) throw new Error('Este ingreso no tiene factura asociada.')
  if (isPosIncome(income)) {
    const sale = await resolveSaleForIncomeInvoice(income.id)
    await printSaleInvoice(sale, ctx)
    return
  }
  const settings = await ensureWorkspaceBillingSettings(ctx?.settings)
  const data = buildInvoiceDataFromManualIncome(income, { ...ctx, settings })
  await printInvoice(data)
}

export async function downloadIncomeInvoice(income, ctx) {
  if (!canIncomeInvoice(income)) throw new Error('Este ingreso no tiene factura asociada.')
  if (isPosIncome(income)) {
    const sale = await resolveSaleForIncomeInvoice(income.id)
    await downloadSaleInvoicePdf(sale, ctx)
    return
  }
  const settings = await ensureWorkspaceBillingSettings(ctx?.settings)
  const data = buildInvoiceDataFromManualIncome(income, { ...ctx, settings })
  await downloadInvoicePdf(data, invoiceFilename(data.id))
}
