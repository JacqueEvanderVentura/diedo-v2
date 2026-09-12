export const CATEGORY_KIND_TO_UI = {
  product: 'producto',
  service: 'servicio',
  supply: 'insumo',
  income: 'ingreso',
  expense: 'gasto',
}

export const CATEGORY_UI_TO_KIND = {
  producto: 'product',
  servicio: 'service',
  insumo: 'supply',
  ingreso: 'income',
  gasto: 'expense',
}

export const CATALOG_CATEGORY_TYPES = ['producto', 'servicio', 'insumo']
export const FINANCE_CATEGORY_TYPES = ['ingreso', 'gasto']

export function categoryKindToUi(kind) {
  return CATEGORY_KIND_TO_UI[kind] || 'producto'
}

export function categoryKindFromUi(type) {
  return CATEGORY_UI_TO_KIND[type] || 'product'
}

export function isCatalogCategory(category) {
  return CATALOG_CATEGORY_TYPES.includes(category?.type)
}

export function isFinanceCategory(category) {
  return FINANCE_CATEGORY_TYPES.includes(category?.type)
}

export function filterCategoriesForSection(categories, section, tab) {
  const rows = categories.filter((category) => category.active !== false)
  if (section === 'catalog') {
    const catalogRows = rows.filter((category) => isCatalogCategory(category))
    if (!tab || tab === 'all') return catalogRows
    return catalogRows.filter((category) => category.type === tab)
  }
  if (section === 'finance') {
    const financeRows = rows.filter((category) => isFinanceCategory(category))
    if (!tab) return financeRows
    return financeRows.filter((category) => category.type === tab)
  }
  return rows
}

export function mergeCategoryOptions(configCategories, legacyOptions, type) {
  const fromConfig = (configCategories || [])
    .filter((category) => category.type === type && category.active !== false)
    .map((category) => ({ value: category.id, label: category.name }))
  const seen = new Set(fromConfig.map((option) => option.value))
  const merged = [...fromConfig]
  legacyOptions.forEach((option) => {
    if (!seen.has(option.value)) merged.push(option)
  })
  return merged
}

export function isSupplyMovementItem(item, supplyIds = new Set()) {
  if (!item) return false
  if (item.itemType === 'supply' || item.type === 'supply') return true
  if (item.id && supplyIds.has(item.id)) return true
  const sku = String(item.sku || '').toUpperCase()
  if (sku.startsWith('INS-')) return true
  return String(item.id || '').startsWith('sup-')
}

export function movementHasSupplyItems(movement, supplyIds = new Set()) {
  return (movement.items || []).some((item) => isSupplyMovementItem(item, supplyIds))
}
