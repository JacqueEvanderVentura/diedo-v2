export const INCOME_ITEM_KIND_OPTIONS = [
  { value: 'service', label: 'Servicio' },
  { value: 'product', label: 'Producto' },
  { value: 'supply', label: 'Insumo' },
  { value: 'general', label: 'Otro ingreso' },
]

export const INCOME_PAYMENT_CATEGORY_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'link', label: 'Link de pago' },
]

export function incomeCategoryForForm(form) {
  if (form.itemKind === 'general') return 'servicios'
  return form.paymentCategory || 'efectivo'
}

export function buildManualIncomePayload(form, customerName) {
  const concept = form.itemKind === 'general'
    ? (form.concept || '').trim()
    : (form.catalogItem?.name || form.concept || '').trim()
  return {
    category: incomeCategoryForForm(form),
    branchId: form.branchId,
    amount: Number(form.amount),
    date: form.date,
    customer: customerName || '',
    source: form.source || 'Formulario',
    status: form.status || 'pagado',
    itemKind: form.itemKind || 'general',
    catalogItemId: form.itemKind === 'general' ? null : (form.catalogItem?.id || null),
    concept,
  }
}

export function validateIncomeForm(form) {
  if (!form.amount || Number(form.amount) <= 0) return 'Ingresa un monto válido.'
  if (!form.branchId) return 'Selecciona una sucursal.'
  if (form.itemKind === 'general') {
    if (!(form.concept || '').trim()) return 'Describe el concepto del ingreso.'
    return ''
  }
  if (!form.catalogItem?.id && !(form.concept || '').trim()) {
    return 'Selecciona un artículo del catálogo o escribe una descripción.'
  }
  return ''
}
