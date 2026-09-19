/** Toggle between none and all selectable ids. */
export function nextSelectAllState(selectedIds, selectableIds) {
  const ids = selectableIds || []
  if (!ids.length) return new Set()
  const allSelected = ids.every((id) => selectedIds.has(id))
  return allSelected ? new Set() : new Set(ids)
}
