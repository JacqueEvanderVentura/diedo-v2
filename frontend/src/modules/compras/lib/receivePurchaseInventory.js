import { useCatalogStore } from '@/stores/catalogStore'
import { useInventarioStore } from '@/stores/inventarioStore'

export function purchaseLinesForInventory(request) {
  return (request?.items || []).filter((item) => item.supplyProductId && Number(item.qty) > 0)
}

export async function receivePurchaseRequestInventory(request, { isOnline = false, lines = [] } = {}) {
  if (isOnline) {
    return { received: 0, skipped: true }
  }
  const mappedRequest = lines.length
    ? {
        ...request,
        items: (request.items || []).map((item) => ({
          ...item,
          supplyProductId:
            lines.find((row) => row.itemId === item.id)?.inventoryItemId || item.supplyProductId,
        })),
      }
    : request
  const inventoryLines = purchaseLinesForInventory(mappedRequest)
  if (!inventoryLines.length) {
    return { received: 0, skipped: true }
  }
  if (!request.branchId) {
    throw new Error('La solicitud no tiene sucursal para registrar la entrada de inventario.')
  }

  const products = useCatalogStore.getState().products
  const adjustmentItems = inventoryLines.map((line) => {
    const product = products.find((row) => row.id === line.supplyProductId)
    const before = Number(product?.stock) || 0
    const delta = Number(line.qty) || 0
    return {
      id: line.supplyProductId,
      name: product?.name || line.name,
      sku: product?.sku,
      unit: product?.unit || line.unit || 'ud',
      stock: before,
      quantity: before + delta,
    }
  })

  await useInventarioStore.getState().recordAdjustment(
    {
      branchId: request.branchId,
      comment: `Compra entregada ${request.number || request.id}`,
      items: adjustmentItems,
    },
    { isOnline },
  )

  return { received: inventoryLines.length, skipped: false }
}
