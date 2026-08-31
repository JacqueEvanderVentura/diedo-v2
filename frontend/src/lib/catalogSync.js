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
  const itemType = apiProduct.itemType || localProduct?.type || 'product'
  const isSupply = itemType === 'supply' || (itemType === 'other' && localProduct?.type === 'supply')
  const isService = itemType === 'service'

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
    price: isSupply ? 0 : apiProduct.salePrice != null ? Number(apiProduct.salePrice) : localProduct?.price ?? 0,
    cost: apiProduct.unitCost != null ? Number(apiProduct.unitCost) : localProduct?.cost ?? 0,
    stock: isService ? null : apiProduct.stockQuantity != null ? Number(apiProduct.stockQuantity) : localProduct?.stock ?? 0,
    minStock: apiProduct.minimumStock != null ? Number(apiProduct.minimumStock) : localProduct?.minStock ?? 0,
    type: isSupply ? 'supply' : itemType,
    taxPct: isSupply ? 0 : apiProduct.taxRate != null ? Number(apiProduct.taxRate) : localProduct?.taxPct ?? 18,
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
  const exact = categories.find((c) => c.id === localCategoryId && c.api)
  if (exact) return exact.id

  const normalizedId = normalizeReference(localCategoryId)
  const semantic = categories.find(
    (c) => c.api && (normalizeReference(c.name) === normalizedId || normalizeReference(c.id) === normalizedId)
  )
  return semantic?.id || null
}

export function defaultUnitId(units, symbol = 'ud') {
  const normalizedSymbol = normalizeReference(symbol)
  const aliases = {
    ud: ['ud', 'unit', 'unidad'],
    caja: ['caja', 'box', 'unit', 'ud'],
    paq: ['paq', 'paquete', 'pack', 'unit', 'ud'],
    lt: ['lt', 'l', 'litro'],
    kg: ['kg', 'kilogramo'],
  }
  const candidates = aliases[normalizedSymbol] || [normalizedSymbol]
  const match = units.find((u) => {
    const unitValues = [u.symbol, u.code, u.name].map(normalizeReference)
    return candidates.some((candidate) => unitValues.includes(candidate))
  })
  return match?.id || units[0]?.id
}

function normalizeReference(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
