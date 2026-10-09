import { mapDocumentAttachmentsFromApi } from '@/services/adapters/documentAttachments'

const optionalText = (value) => value?.trim() || null

function mapQuoteFile(request) {
  const attachments = mapDocumentAttachmentsFromApi(request.attachments)
  const quote = [...attachments].reverse().find((item) => item.purpose === 'quote')
  if (quote) return quote
  if (!request.quoteFile) return null
  return {
    id: request.quoteFile.id || null,
    name: request.quoteFile.name,
    contentType: request.quoteFile.contentType || null,
    previewUrl: request.quoteFile.previewUrl || null,
    downloadUrl: request.quoteFile.previewUrl || null,
    purpose: 'quote',
  }
}

export function mapSupplierFromApi(supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    rnc: supplier.rnc || '',
    contactName: supplier.contactName || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    address: supplier.address || '',
    branchIds: supplier.branchIds || [],
    productCount: Number(supplier.productCount) || 0,
    active: supplier.active,
    version: supplier.version,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
    apiSynced: true,
  }
}

export function supplierToApiPayload(form) {
  if (!form.name?.trim()) throw new Error('Ingresa el nombre del proveedor.')
  if (!form.branchIds?.length) throw new Error('Selecciona al menos una sucursal autorizada.')
  return {
    name: form.name.trim(),
    rnc: optionalText(form.rnc),
    contactName: optionalText(form.contactName),
    phone: optionalText(form.phone),
    email: optionalText(form.email),
    address: optionalText(form.address),
    branchIds: form.branchIds,
  }
}

export function mapPurchaseRequestFromApi(request) {
  return {
    id: request.id,
    number: request.number,
    supplierId: request.supplierId,
    supplierName: request.supplierName,
    branchId: request.branchId,
    requesterName: request.requesterName,
    requesterId: request.requesterId,
    items: (request.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      qty: Number(item.qty) || 0,
      unit: item.unit,
      price: Number(item.price) || 0,
      subtotal: Number(item.subtotal) || 0,
      catalogItemId: item.catalogItemId || null,
      categoryId: item.categoryId || null,
      inventoryItemId: item.inventoryItemId || null,
    })),
    status: request.status,
    priority: request.priority,
    notes: request.notes || '',
    quoteFile: mapQuoteFile(request),
    attachments: mapDocumentAttachmentsFromApi(request.attachments),
    total: Number(request.total) || 0,
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
    reviewedBy: request.reviewedBy,
    paidAt: request.paidAt,
    deliveredAt: request.deliveredAt,
    financeExpenseId: request.financeExpenseId || null,
    version: request.version,
    updatedAt: request.updatedAt,
    apiSynced: true,
  }
}

export function purchaseRequestToApiPayload(form) {
  if (!form.supplierId) throw new Error('Selecciona un proveedor.')
  if (!form.branchId) throw new Error('Selecciona una sucursal.')
  const items = (form.items || []).filter((item) => item.name?.trim())
  if (!items.length) throw new Error('Agrega al menos un artículo.')
  return {
    supplierId: form.supplierId,
    branchId: form.branchId,
    items: items.map((item) => ({
      name: item.name.trim(),
      qty: Number(item.qty),
      unit: item.unit?.trim() || 'unidad',
      price: Number(item.price),
      catalogItemId: item.catalogItemId || null,
      categoryId: item.categoryId || null,
    })),
    priority: form.priority || 'normal',
    notes: optionalText(form.notes),
    quoteFile: form.quoteFile?.name ? { name: form.quoteFile.name } : null,
  }
}

export function mapPurchasingSettingsFromApi(settings) {
  return {
    approverUserId: settings.approverUserId || '',
    approverUser: settings.approverUser || null,
    notifyOnRequest: settings.notifyOnRequest,
    version: settings.version,
    updatedAt: settings.updatedAt,
    apiSynced: true,
  }
}

export function purchasingSettingsToApiPayload(settings, version) {
  return {
    version,
    approverUserId: settings.approverUserId || null,
    notifyOnRequest: Boolean(settings.notifyOnRequest),
  }
}
