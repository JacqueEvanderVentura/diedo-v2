import { useState, useEffect, useCallback, useRef } from 'react'

export function usePaginatedReport(fetcher, initialFilters = {}, initialPageSize = 10) {
  const [filters, setFilters] = useState(initialFilters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1, from: 0, to: 0 })
  const [loading, setLoading] = useState(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetcherRef.current({ ...filters, page, pageSize })
      setResult(data)
      if (data.page && data.page !== page) setPage(data.page)
    } finally {
      setLoading(false)
    }
  }, [filters, page, pageSize])

  useEffect(() => {
    load()
  }, [load])

  const setFilter = (key, value) => {
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const resetFilters = () => {
    setPage(1)
    setFilters(initialFilters)
  }

  return {
    ...result,
    loading,
    page,
    pageSize,
    filters,
    setPage,
    setPageSize: (size) => {
      setPage(1)
      setPageSize(size)
    },
    setFilter,
    setFilters,
    resetFilters,
    reload: load,
  }
}
