import { Search, Building2, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { PeriodFilter } from './PeriodFilter'
import { useConfigStore } from '@/stores/configStore'
import { branchIdFromSelection } from '@/lib/branches'

export function ReportFilterBar({
  branchId,
  branchIds,
  onBranchChange,
  onBranchIdsChange,
  period,
  dateFrom = null,
  dateTo = null,
  onPeriodChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar…',
  status,
  onStatusChange,
  statusOptions = [],
  statusLabel = 'Estado',
  extra,
  onRefresh,
  showPeriod = false,
  periodOptions,
  showBranch = true,
  multiBranch = true,
  showSearch = true,
  testId = 'report-filters',
}) {
  const branches = useConfigStore((s) => s.branches)
  const resolvedBranchIds = branchIds ?? (branchId ? [branchId] : [])
  const legacyBranchOptions = [
    { value: '', label: 'Todas las sucursales' },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ]

  const handleBranchIdsChange = (nextBranchIds) => {
    onBranchIdsChange?.(nextBranchIds)
    onBranchChange?.(branchIdFromSelection(nextBranchIds, branchId))
  }

  const handlePeriodChange = ({ period: nextPeriod, dateFrom: nextFrom, dateTo: nextTo }) => {
    onPeriodChange?.({ period: nextPeriod, dateFrom: nextFrom, dateTo: nextTo })
  }

  const hasStatus = Boolean(onStatusChange && statusOptions.length > 0)
  const hasSearch = Boolean(showSearch && onSearchChange)
  const showScopeRow = (showBranch && (onBranchIdsChange || onBranchChange)) || (showPeriod && onPeriodChange)

  return (
    <div className="space-y-4 rounded-xl border border-slate-100 bg-white p-4 shadow-soft" data-testid={testId}>
      {showScopeRow && (
        <div className="flex flex-col gap-3">
          {showBranch && (onBranchIdsChange || onBranchChange) && (
            <div className="w-full min-w-0">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400">
                <Building2 className="h-3.5 w-3.5" /> Sucursal
              </label>
              {multiBranch && onBranchIdsChange ? (
                <BranchMultiSelect
                  branches={branches}
                  branchIds={resolvedBranchIds}
                  onChange={handleBranchIdsChange}
                  testId={`${testId}-branch`}
                />
              ) : (
                <Select
                  value={branchId || ''}
                  onChange={onBranchChange}
                  options={legacyBranchOptions}
                  data-testid={`${testId}-branch`}
                />
              )}
            </div>
          )}
          {showPeriod && onPeriodChange && (
            <div className="w-full min-w-0">
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Período</label>
              <PeriodFilter
                period={period}
                dateFrom={dateFrom}
                dateTo={dateTo}
                onChange={handlePeriodChange}
                periods={periodOptions}
              />
            </div>
          )}
        </div>
      )}
      {(hasStatus || hasSearch || extra || onRefresh) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {hasStatus && (
            <div className="w-full min-w-0 sm:min-w-[180px] sm:max-w-xs sm:flex-1">
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">{statusLabel}</label>
              <Select
                value={status || ''}
                onChange={onStatusChange}
                options={[{ value: '', label: 'Todos' }, ...statusOptions]}
              />
            </div>
          )}
          {hasSearch && (
            <div className="w-full min-w-0 sm:min-w-[220px] sm:flex-[2]">
              <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Búsqueda</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder={searchPlaceholder}
                  value={search || ''}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
            </div>
          )}
          {extra}
          {onRefresh && (
            <Button variant="secondary" onClick={onRefresh} className="w-full shrink-0 sm:w-auto">
              <RefreshCw className="h-4 w-4" /> Actualizar
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
