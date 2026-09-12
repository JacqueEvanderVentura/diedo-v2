import { downloadSaleInvoicePdf, printSaleInvoice } from '@/modules/crm/lib/sales'
import { mapSaleFromApi } from '@/services/adapters/pos'
import { posApi } from '@/services/posApi'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'

export function isPosIncome(income) {
  return income?.source === 'POS' || income?.origin === 'pos'
}

export async function resolveSaleForIncomeInvoice(saleId) {
  const sale = usePosStore.getState().sales.find((item) => item.id === saleId)
  if (sale?.items?.length || sale?.detailLoaded) return sale
  if (useSessionStore.getState().status === 'online') {
    const response = await posApi.getSale(saleId)
    return mapSaleFromApi(response)
  }
  if (!sale) throw new Error('No se encontró la venta asociada a este ingreso.')
  return sale
}

export async function printIncomeInvoice(income, ctx) {
  if (!isPosIncome(income)) throw new Error('Este ingreso no tiene factura asociada.')
  const sale = await resolveSaleForIncomeInvoice(income.id)
  printSaleInvoice(sale, ctx)
}

export async function downloadIncomeInvoice(income, ctx) {
  if (!isPosIncome(income)) throw new Error('Este ingreso no tiene factura asociada.')
  const sale = await resolveSaleForIncomeInvoice(income.id)
  await downloadSaleInvoicePdf(sale, ctx)
}
