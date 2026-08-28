import { Search, RefreshCw, Filter, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useConfigStore } from '@/stores/configStore'
import { buildBranchFilterOptions } from '@/lib/branches'
import { cn } from '@/lib/utils'

/**
 * General-purpose filter bar: search + optional select filters.
 * Use ReportFilterBar for report pages with period/branch presets.
 */
export function DataFilterBar({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Buscar…',
  showSearch = true,
  branchId,
  onBranchChange,
  showBranch = false,
  branchAllValue = 'all',
  filters = [],
  extra,
  onRefresh,
  className,
  testId = 'data-filters',
}) {
  const branches = useConfigStore((s) => s.branches)
  const branchOptions = buildBranchFilterOptions(branches, { allValue: branchAllValue })

  return (
    <div
      className={cn('space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-soft', className)}
      data-testid={testId}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        {showBranch && onBranchChange && (
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400">
              <Building2 className="h-3.5 w-3.5" /> Sucursal
            </label>
            <Select
              value={branchId ?? branchAllValue}
              onChange={onBranchChange}
              options={branchOptions}
              data-testid={`${testId}-branch`}
            />
          </div>
        )}
        {showSearch && onSearchChange && (
          <div className="min-w-[220px] flex-[2]">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400">
              <Search className="h-3.5 w-3.5" /> Búsqueda general
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                data-testid={`${testId}-search`}
              />
            </div>
          </div>
        )}
        {filters.map((f) => (
          <div key={f.id} className={cn('min-w-[160px] flex-1', f.className)}>
            {f.label && (
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-400">
                {f.icon || <Filter className="h-3.5 w-3.5" />}
                {f.label}
              </label>
            )}
            <Select
              value={f.value ?? ''}
              onChange={f.onChange}
              options={f.options}
              placeholder={f.placeholder}
            />
          </div>
        ))}
        {extra}
        {onRefresh && (
          <Button variant="secondary" onClick={onRefresh} className="shrink-0">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        )}
      </div>
    </div>
  )
}
