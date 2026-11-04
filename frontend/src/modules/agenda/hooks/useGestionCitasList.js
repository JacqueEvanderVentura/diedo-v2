import { useCallback, useEffect, useMemo, useState } from 'react'

import { listAppointmentsPage } from '@/services/appointmentsApi'
import { useSessionStore } from '@/stores/sessionStore'

import {
  buildGestionCitasListParams,
  DEFAULT_GESTION_CITAS_PAGE_SIZE,
  gestionCitasPaginationMeta,
} from '../lib/gestionCitasList'

const POLL_INTERVAL_MS = 10000

export function useGestionCitasList(filters) {
  const sessionStatus = useSessionStore((state) => state.status)
  const canLoad = sessionStatus === 'online' || sessionStatus === 'demo'

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_GESTION_CITAS_PAGE_SIZE)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [items, setItems] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const filterSignature = useMemo(
    () => JSON.stringify({
      search: filters.search,
      dateFilter: filters.dateFilter,
      employeeId: filters.employeeId,
      branchId: filters.branchId,
      status: filters.status,
    }),
    [filters.search, filters.dateFilter, filters.employeeId, filters.branchId, filters.status],
  )

  const listParams = useMemo(
    () => buildGestionCitasListParams({
      ...filters,
      page,
      pageSize,
      sortKey,
      sortDir,
    }),
    [filters, page, pageSize, sortKey, sortDir],
  )

  const refresh = useCallback(async () => {
    if (!canLoad) {
      setLoading(false)
      setItems([])
      setTotalItems(0)
      setTotalPages(1)
      return
    }
    setLoading(true)
    try {
      const result = await listAppointmentsPage(listParams)
      setItems(result.items)
      setTotalItems(result.totalItems)
      setTotalPages(result.totalPages)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [canLoad, listParams])

  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  useEffect(() => {
    let disposed = false

    const run = async () => {
      if (disposed) return
      await refresh()
    }

    run()
    return () => {
      disposed = true
    }
  }, [refresh])

  useEffect(() => {
    if (!canLoad) return undefined
    let disposed = false

    const tick = () => {
      if (disposed || document.hidden) return
      refresh().catch(() => {})
    }

    const interval = window.setInterval(tick, POLL_INTERVAL_MS)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tick()
    })

    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('focus', tick)
    }
  }, [canLoad, refresh])

  const toggleSort = useCallback((column) => {
    setPage(1)
    if (sortKey === column) {
      setSortDir((currentDir) => (currentDir === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(column)
    setSortDir(column === 'date' || column === 'time' ? 'desc' : 'asc')
  }, [sortKey])

  const setPageSizeSafe = useCallback((nextSize) => {
    setPage(1)
    setPageSize(nextSize)
  }, [])

  const pagination = gestionCitasPaginationMeta({ page, pageSize, totalItems, totalPages })

  return {
    items,
    loading,
    error,
    refresh,
    sortKey,
    sortDir,
    toggleSort,
    page: pagination.page,
    setPage,
    pageSize: pagination.pageSize,
    setPageSize: setPageSizeSafe,
    totalItems: pagination.totalItems,
    totalPages: pagination.totalPages,
    from: pagination.from,
    to: pagination.to,
  }
}
