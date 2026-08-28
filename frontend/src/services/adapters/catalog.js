import { CATEGORY_COLORS } from '@/stores/configStore'

export function mapCategoryFromApi(item, index = 0) {
  return {
    id: item.id,
    name: item.name,
    description: item.description || '',
    active: item.status === 'active',
    status: item.status,
    version: item.version,
    type: 'producto',
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length].id,
    api: true,
  }
}

export function mapCategoryCreatePayload(data) {
  return {
    name: data.name,
    description: data.description || null,
    status: data.active === false ? 'inactive' : 'active',
  }
}

export function mapCategoryUpdatePayload(data, version) {
  return {
    version,
    name: data.name,
    description: data.description ?? null,
    status: data.active === false ? 'inactive' : 'active',
  }
}

export function buildCategoryIdMap(categories) {
  const map = new Map()
  categories.forEach((c) => {
    if (c.id) map.set(c.id, c.id)
  })
  return map
}
