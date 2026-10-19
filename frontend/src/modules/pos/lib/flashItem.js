const API_UNAVAILABLE = 'La API no está disponible.'

export async function createFlashItemForPos({
  data,
  isOnline,
  canManageCatalog,
  categories,
  configBranches,
  saveProduct,
  addItem,
  hydratePos,
  getPosCatalog,
}) {
  if (!isOnline) {
    throw new Error(API_UNAVAILABLE)
  }

  if (!canManageCatalog) {
    throw new Error('No tienes permiso para crear ítems del catálogo.')
  }

  const productId = await saveProduct(data, null, {
    categories,
    configBranches,
    isOnline: true,
  })
  await hydratePos(data.branchId, { force: true })
  const product = getPosCatalog().find((item) => item.id === productId)
  if (!product) {
    throw new Error('El ítem se creó, pero aún no está disponible en el catálogo POS de esta sucursal. Actualiza el POS para volver a cargarlo.')
  }
  addItem(product)
  return product
}
