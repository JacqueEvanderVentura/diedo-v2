import { METHOD_ICON, METHOD_LABELS } from '@/modules/crm/lib/crm'
import { paymentMethodSemanticCode } from '@/services/adapters/pos'

const EXTRA_LABELS = {
  servicios: 'Servicios',
  card: 'Tarjeta',
  cash: 'Efectivo',
  transfer: 'Transferencia',
  payment_link: 'Link de pago',
  credit: 'Cta. por Cobrar',
}

function normalizedCategoryKey(category) {
  const raw = String(category || '').trim()
  if (!raw) return 'otros'
  return paymentMethodSemanticCode(raw)
}

function findPaymentMethod(paymentMethods, category) {
  if (!paymentMethods?.length || !category) return null
  const raw = String(category).trim().toLowerCase()
  const semantic = normalizedCategoryKey(category)
  return paymentMethods.find((method) => {
    const code = String(method.code || '').toLowerCase()
    const semanticCode = String(method.semanticCode || method.id || '').toLowerCase()
    const id = String(method.id || '').toLowerCase()
    return code === raw || semanticCode === semantic || id === semantic || id === raw
  }) || null
}

export function incomeCategorySemanticKey(category) {
  return normalizedCategoryKey(category)
}

export function incomeCategoryLabel(category, paymentMethods = []) {
  const configured = findPaymentMethod(paymentMethods, category)
  if (configured?.name) return configured.name
  const semantic = normalizedCategoryKey(category)
  return METHOD_LABELS[semantic]
    || EXTRA_LABELS[semantic]
    || EXTRA_LABELS[String(category || '').trim().toLowerCase()]
    || category
    || '—'
}

export function incomeCategoryIconName(category) {
  const semantic = normalizedCategoryKey(category)
  return METHOD_ICON[semantic] || 'Circle'
}
