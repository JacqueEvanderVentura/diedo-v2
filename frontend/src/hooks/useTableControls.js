import { useCallback, useMemo, useState } from 'react'
import { applySort, filterAndSort, filterBySearch } from '@/lib/tableControls'

/**
 * Client-side search + sort for table/card lists.
 * Pass `search` externally when the page already owns filter state.
 */
export function useTableControls(rows, options = {}) {
  const {
    defaultSort = null,
    accessors = {},
    search: externalSearch,
    onSearchChange,
    getSearchText,
    initialSearch = '',
  } = options

  const [internalSearch, setInternalSearch] = useState(initialSearch)
  const search = externalSearch !== undefined ? externalSearch : internalSearch
  const setSearch = onSearchChange ?? setInternalSearch

  const [sortKey, setSortKey] = useState(defaultSort?.key ?? null)
  const [sortDir, setSortDir] = useState(defaultSort?.dir ?? 'asc')

  const toggleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return key
      }
      setSortDir('asc')
      return key
    })
  }, [])

  const filteredRows = useMemo(() => {
    if (!getSearchText) return rows ?? []
    return filterBySearch(rows ?? [], search, getSearchText)
  }, [rows, search, getSearchText])

  const sortedRows = useMemo(
    () => applySort(filteredRows, sortKey, sortDir, accessors),
    [filteredRows, sortKey, sortDir, accessors]
  )

  return {
    rows: sortedRows,
    filteredRows,
    search,
    setSearch,
    sortKey,
    sortDir,
    toggleSort,
    setSortKey,
    setSortDir,
  }
}

export function useSortedRows(rows, options = {}) {
  const { defaultSort = null, accessors = {} } = options
  const [sortKey, setSortKey] = useState(defaultSort?.key ?? null)
  const [sortDir, setSortDir] = useState(defaultSort?.dir ?? 'asc')

  const toggleSort = useCallback((key) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return key
      }
      setSortDir('asc')
      return key
    })
  }, [])

  const sortedRows = useMemo(
    () => applySort(rows ?? [], sortKey, sortDir, accessors),
    [rows, sortKey, sortDir, accessors]
  )

  return { rows: sortedRows, sortKey, sortDir, toggleSort, setSortKey, setSortDir }
}
