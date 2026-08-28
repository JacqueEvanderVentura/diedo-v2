/**
 * Shared search + sort helpers for list/table views.
 */

export function normalizeSearch(q) {
  return String(q || '').trim().toLowerCase()
}

export function filterBySearch(rows, query, getText) {
  const q = normalizeSearch(query)
  if (!q) return rows
  return rows.filter((row) => normalizeSearch(getText(row)).includes(q))
}

export function compareValues(a, b) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number' && !Number.isNaN(a) && !Number.isNaN(b)) {
    return a - b
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime()
  }
  return String(a).localeCompare(String(b), 'es', { sensitivity: 'base', numeric: true })
}

export function applySort(rows, sortKey, sortDir = 'asc', accessors = {}) {
  if (!sortKey || !rows?.length) return rows ?? []
  const get = accessors[sortKey] ?? ((row) => row[sortKey])
  const dir = sortDir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => compareValues(get(a), get(b)) * dir)
}

export function filterAndSort(rows, { search, getSearchText, sortKey, sortDir, accessors } = {}) {
  const filtered = getSearchText ? filterBySearch(rows, search, getSearchText) : rows
  return applySort(filtered, sortKey, sortDir, accessors)
}
