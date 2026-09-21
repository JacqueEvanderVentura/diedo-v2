import { collectSalePaymentProofs, findReceivableForSale } from '@/modules/crm/lib/saleProofs'

export function resolvePosIncomeProofs(saleId, { sales = [], receivables = [] } = {}) {
  const sale = sales.find((item) => item.id === saleId)
  if (!sale) return []
  return collectSalePaymentProofs(sale, findReceivableForSale(receivables, saleId))
}

export function incomeHasProofs(income) {
  return Boolean((income?.attachments || []).length || (income?.paymentProofs || []).length)
}

export function incomeProofItems(income) {
  if (!income) return []
  if (income.paymentProofs?.length) return income.paymentProofs
  return income.attachments || []
}
