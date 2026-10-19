export const PURCHASE_DOCUMENT_TYPES = [
  {
    purpose: 'quote',
    label: 'Cotización',
    empty: 'Sin cotización',
    uploadStatuses: ['pendiente', 'aprobada'],
  },
  {
    purpose: 'invoice',
    label: 'Factura',
    empty: 'Sin factura',
    uploadStatuses: ['aprobada', 'pagada', 'entregada'],
  },
  {
    purpose: 'payment',
    label: 'Comprobante de pago',
    empty: 'Sin comprobante de pago',
    uploadStatuses: ['aprobada', 'pagada', 'entregada'],
  },
  {
    purpose: 'receipt',
    label: 'Comprobante de recibimiento',
    empty: 'Sin comprobante de recibimiento',
    uploadStatuses: [],
  },
]

export function documentsForPurpose(request, purpose) {
  const attachments = request?.attachments || []
  const matched = attachments.filter((item) => item.purpose === purpose)
  if (matched.length) return matched
  if (purpose === 'quote' && request?.quoteFile) {
    return [{
      ...request.quoteFile,
      purpose: 'quote',
      name: request.quoteFile.name,
    }]
  }
  return []
}

export function latestDocument(request, purpose) {
  const items = documentsForPurpose(request, purpose)
  return items[items.length - 1] || null
}

export function documentCount(request) {
  return PURCHASE_DOCUMENT_TYPES.filter((type) => latestDocument(request, type.purpose)).length
}
