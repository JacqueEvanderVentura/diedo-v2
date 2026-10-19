import { apiClient } from './apiClient'

const DOCUMENTS_BASE = '/api/v1/documents'

export function invoiceDataToPdfPayload(data) {
  return {
    id: data.id,
    kind: data.kind || 'sale',
    issuedAt: data.issuedAt,
    validUntil: data.validUntil || '',
    branchName: data.branchName || '',
    region: data.region || '',
    customerName: data.customerName || 'Cliente',
    customerPhone: data.customerPhone || '',
    customerTaxLine: data.customerTaxLine || '',
    paymentMethod: data.paymentMethod || '',
    paymentReference: data.paymentReference || '',
    businessName: data.businessName || '',
    legalName: data.legalName || '',
    businessRnc: data.businessRnc || '',
    businessAddress: data.businessAddress || '',
    businessPhone: data.businessPhone || '',
    businessEmail: data.businessEmail || null,
    logoDataUrl: data.logoDataUrl || '',
    footerNote: data.footerNote || '',
    items: (data.items || []).map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      listPrice: item.listPrice ?? item.price,
      sku: item.sku || null,
    })),
    subtotal: data.subtotal,
    discountAmt: data.discountAmt ?? 0,
    discountPct: data.discountPct ?? 0,
    taxPct: data.taxPct ?? 0,
    taxLabel: data.taxLabel || '',
    taxAmt: data.taxAmt ?? 0,
    total: data.total,
    paidAmount: data.paidAmount ?? 0,
    balanceDue: data.balanceDue ?? null,
  }
}

export const documentsApi = {
  renderInvoicePdf: (data) => apiClient.postBlob(
    `${DOCUMENTS_BASE}/invoices/pdf`,
    invoiceDataToPdfPayload(data),
  ),
}
