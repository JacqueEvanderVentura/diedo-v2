import { useCallback, useMemo, useState } from 'react'
import { branchIdFromSelection } from '@/lib/branches'

export function useReportFilters({
  period: initialPeriod = 'month',
  dateFrom: initialDateFrom = null,
  dateTo: initialDateTo = null,
  branchIds: initialBranchIds = [],
} = {}) {
  const [period, setPeriod] = useState(initialPeriod)
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo)
  const [branchIds, setBranchIds] = useState(initialBranchIds)

  const onPeriodChange = useCallback(({ period: nextPeriod, dateFrom: nextFrom, dateTo: nextTo }) => {
    setPeriod(nextPeriod)
    setDateFrom(nextFrom)
    setDateTo(nextTo)
  }, [])

  const params = useMemo(
    () => ({
      period,
      dateFrom,
      dateTo,
      branchIds,
      branchId: branchIdFromSelection(branchIds),
    }),
    [period, dateFrom, dateTo, branchIds]
  )

  return {
    period,
    dateFrom,
    dateTo,
    branchIds,
    branchId: params.branchId,
    setBranchIds,
    onPeriodChange,
    params,
  }
}
