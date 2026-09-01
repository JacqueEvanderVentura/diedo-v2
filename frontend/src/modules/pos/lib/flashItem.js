export async function createFlashItemForPos({
  data,
  isOnline,
  canManageCatalog,
  categories,
  configBranches,
  addProduct,
  saveProduct,
  addItem,
  hydratePos,
  getPosCatalog,
}) {
  if (!isOnline) {
    const product = addProduct(data)
    addItem(product)
    return product
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
