import { Search } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { initials, priorityMeta, statusMeta, typeMeta, TYPE_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from '@/data/incidencias'
import { cn } from '@/lib/utils'

export function IncidenciaList({
  items,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  branchFilter,
  onBranchFilterChange,
  branchOptions,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-100 bg-white shadow-soft">
      <div className="space-y-3 border-b border-slate-100 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar por código, título o referencia..."
            data-testid="incidencias-search"
            className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Select
            value={branchFilter}
            onChange={onBranchFilterChange}
            options={branchOptions}
            size="md"
            menuMinWidth={240}
            data-testid="incidencias-filter-branch"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Desde</label>
              <Input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} data-testid="incidencias-filter-date-from" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hasta</label>
              <Input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} data-testid="incidencias-filter-date-to" />
            </div>
          </div>
          <Select
            value={typeFilter}
            onChange={onTypeFilterChange}
            options={TYPE_FILTER_OPTIONS}
            size="md"
            menuMinWidth={240}
            data-testid="incidencias-filter-type"
          />
          <Select
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={STATUS_FILTER_OPTIONS}
            size="md"
            menuMinWidth={200}
            data-testid="incidencias-filter-status"
          />
        </div>
      </div>

      <div className="max-h-[700px] flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin" data-testid="incidencias-list">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Sin incidencias con esos filtros.</p>
        ) : (
          items.map((item) => {
            const pr = priorityMeta(item.priority)
            const st = statusMeta(item.status)
            const tp = typeMeta(item.type)
            const active = selectedId === item.id
            const lead = item.intervenientes[0]
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                data-testid={`incidencia-card-${item.id}`}
                className={cn(
                  'w-full rounded-xl border-2 p-4 text-left transition-all hover:shadow-md',
                  active ? 'border-blue-600 bg-blue-50/50 shadow-sm' : 'border-slate-100 bg-white hover:border-slate-200'
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-slate-500">{item.code}</span>
                  <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase', pr.className)}>{pr.name}</span>
                </div>
                <h4 className="mb-2 truncate text-sm font-bold text-slate-800">{item.title}</h4>
                <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-medium lowercase text-slate-600">{tp.id}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {lead ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                      {initials(lead.name)}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                  <Badge tone={st.tone}>{st.name}</Badge>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
