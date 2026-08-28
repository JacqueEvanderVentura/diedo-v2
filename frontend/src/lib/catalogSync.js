function normSku(sku) {
  return sku ? String(sku).trim().toUpperCase() : null
}

function findLocalMatch(apiProduct, localProducts) {
  const apiSku = normSku(apiProduct.sku)
  if (apiSku) {
    const bySku = localProducts.find((p) => normSku(p.sku) === apiSku)
    if (bySku) return bySku
  }
  const name = apiProduct.name?.trim().toLowerCase()
  return localProducts.find((p) => p.name?.trim().toLowerCase() === name)
}

export function mergeApiProduct(apiProduct, localProduct, categoryIdToLocal) {
  const categoryLocalId =
    categoryIdToLocal.get(apiProduct.category?.id) || localProduct?.category || 'otros'
  const branchIds = (apiProduct.branches || []).map((b) => b.id)
  const isSupply = localProduct?.type === 'supply'
  const isService = localProduct?.type === 'service'

  return {
    ...(localProduct || {}),
    id: apiProduct.id,
    name: apiProduct.name,
    sku: apiProduct.sku,
    categoryId: apiProduct.category?.id,
    category: categoryLocalId,
    branchIds: branchIds.length ? branchIds : localProduct?.branchIds || [],
    branchId: branchIds[0] || localProduct?.branchId,
    status: apiProduct.status,
    version: apiProduct.version,
    unitOfMeasureId: apiProduct.unitOfMeasure?.id,
    unit: localProduct?.unit || apiProduct.unitOfMeasure?.symbol || 'ud',
    price: isSupply ? 0 : localProduct?.price ?? 0,
    cost: localProduct?.cost ?? 0,
    stock: isService ? null : localProduct?.stock ?? 0,
    minStock: localProduct?.minStock ?? 0,
    type: localProduct?.type ?? 'product',
    taxPct: isSupply ? 0 : localProduct?.taxPct ?? 18,
    allowNegativeStock: localProduct?.allowNegativeStock ?? false,
    apiSynced: true,
  }
}

export function mergeProductLists(apiProducts, localProducts, categoryIdToLocal) {
  const consumed = new Set()
  const merged = apiProducts.map((apiProduct) => {
    const local = findLocalMatch(apiProduct, localProducts)
    if (local) consumed.add(local.id)
    return mergeApiProduct(apiProduct, local, categoryIdToLocal)
  })

  const localOnly = localProducts.filter((p) => !consumed.has(p.id))
  return [...merged, ...localOnly]
}

export function resolveApiBranchIds(localBranchId, configBranches, apiBranches) {
  const local = configBranches.find((b) => b.id === localBranchId)
  if (!local) return apiBranches[0]?.id ? [apiBranches[0].id] : []
  const match = apiBranches.find(
    (b) => b.name?.toLowerCase() === local.name?.toLowerCase() || b.id === local.id
  )
  if (match) return [match.id]
  return apiBranches[0]?.id ? [apiBranches[0].id] : []
}

export function resolveCategoryId(localCategoryId, categories) {
  const cat = categories.find((c) => c.id === localCategoryId)
  return cat?.api ? cat.id : categories.find((c) => c.api)?.id
}

export function defaultUnitId(units, symbol = 'ud') {
  const match = units.find(
    (u) => u.symbol?.toLowerCase() === symbol.toLowerCase() || u.code?.toLowerCase() === symbol.toLowerCase()
  )
  return match?.id || units[0]?.id
}
