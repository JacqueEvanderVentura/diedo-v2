function normalizeCategoryKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/** Whether a POS catalog row belongs to the selected category bubble id. */
export function productMatchesPosCategory(product, categoryId, categories = []) {
  if (!categoryId || categoryId === 'all') return true
  if (!product) return false

  const productKeys = [
    product.category,
    product.categoryId,
  ].filter(Boolean)

  if (productKeys.some((key) => key === categoryId)) return true

  const selected = categories.find((cat) => cat.id === categoryId)
  if (!selected) return false

  const selectedKeys = new Set([
    normalizeCategoryKey(selected.id),
    normalizeCategoryKey(selected.name),
  ])

  return productKeys.some((key) => selectedKeys.has(normalizeCategoryKey(key)))
}
