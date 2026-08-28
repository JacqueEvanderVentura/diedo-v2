export const PAGE_SIZE_OPTIONS = [10, 25, 50]

export function paginateSlice(items, { page = 1, pageSize = 10 } = {}) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    totalPages,
    page: safePage,
    pageSize,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  }
}

export function matchesSearch(text, q) {
  if (!q) return true
  return String(text || '').toLowerCase().includes(q.trim().toLowerCase())
}
