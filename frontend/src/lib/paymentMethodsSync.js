import { mapPaymentMethodsFromApi } from '@/services/adapters/pos'
import { posApi } from '@/services/posApi'
import { useConfigStore } from '@/stores/configStore'

/**
 * Carga métodos de pago del workspace (misma API que Configuración) con apiId para checkout/factura.
 * No requiere abrir Terminal POS ni coincidir sucursal en posStore.
 */
export async function syncWorkspacePaymentMethods() {
  const response = await posApi.paymentMethods()
  const methods = mapPaymentMethodsFromApi(response)
  if (!methods.length) {
    throw new Error('No hay métodos de pago activos en el workspace.')
  }
  useConfigStore.getState().setPaymentMethods(methods)
  return methods
}
