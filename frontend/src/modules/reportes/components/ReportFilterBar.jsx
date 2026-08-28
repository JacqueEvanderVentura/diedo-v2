import { Search, Building2, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { PeriodFilter } from './PeriodFilter'
import { useConfigStore } from '@/stores/configStore'

export function ReportFilterBar({
  branchId,
  onBranchChange,
  period,
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
  showBranch = true,
  showSearch = true,
  testId = 'report-filters',
}) {
  const branches = useConfigStore((s) => s.branches)
  const branchOptions = [
    { value: '', label: 'Todas las sucursales' },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ]

  return (
    <div className="space-y-4 rounded-xl border border-slate-100 bg-white p-4 shadow-soft" data-testid={testId}>
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        {showBranch && onBranchChange && (
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400">
              <Building2 className="h-3.5 w-3.5" /> Sucursal
            </label>
            <Select value={branchId || ''} onChange={onBranchChange} options={branchOptions} />
          </div>
        )}
        {showPeriod && onPeriodChange && (
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Período</label>
            <PeriodFilter period={period} onChange={onPeriodChange} />
          </div>
        )}
        {onStatusChange && statusOptions.length > 0 && (
          <div className="min-w-[180px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">{statusLabel}</label>
            <Select
              value={status || ''}
              onChange={onStatusChange}
              options={[{ value: '', label: 'Todos' }, ...statusOptions]}
            />
          </div>
        )}
        {extra}
        {showSearch && onSearchChange && (
          <div className="min-w-[220px] flex-[2]">
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
        {onRefresh && (
          <Button variant="secondary" onClick={onRefresh} className="shrink-0">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        )}
      </div>
    </div>
  )
}
