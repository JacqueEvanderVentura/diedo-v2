import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, ArchiveX, Search, Boxes } from 'lucide-react'
import { useActivosStore, ACTIVO_STATUSES, statusMeta, catName } from '@/stores/activosStore'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { formatDOP } from '@/lib/format'
import { buildBranchFilterOptions, branchName } from '@/lib/branches'
import { Select } from '@/components/ui/Select'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { ActivoFormModal } from '@/modules/activos/components/ActivoFormModal'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { cn } from '@/lib/utils'

export function ActivosTab() {
  const activos = useActivosStore((s) => s.activos)
  const categories = useActivosStore((s) => s.categories)
  const retireActivo = useActivosStore((s) => s.retireActivo)
  const loadError = useActivosStore((s) => s.error)
  const branches = useConfigStore((s) => s.branches)
  const isOnline = useSessionStore((s) => s.isOnline())

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [retiringId, setRetiringId] = useState(null)
  const categoryFilters = [{ id: 'all', name: 'Todos' }, ...categories]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activos.filter((a) => {
      const matchCat = category === 'all' || a.category === category
      const matchStatus = status === 'all' || a.status === status
      const matchBranch = branchFilter === 'all' || a.branchId === branchFilter
      const matchQ = !q || a.name.toLowerCase().includes(q) || (a.code && String(a.code).toLowerCase().includes(q))
      return matchCat && matchStatus && matchBranch && matchQ
    })
  }, [activos, query, category, status, branchFilter])

  const { rows: displayRows, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'name', dir: 'asc' },
    accessors: {
      name: (a) => a.name,
      category: (a) => catName(a.category, categories),
      branch: (a) => branchName(branches, a.branchId),
      location: (a) => a.location || '',
      status: (a) => a.status || '',
      value: (a) => a.value || 0,
    },
  })

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (a) => {
    setEditing(a)
    setModalOpen(true)
  }
  const handleRetire = async (a) => {
    setRetiringId(a.id)
    try {
      await retireActivo(a.id, { isOnline })
      toast.success(`"${a.name}" dado de baja`)
    } catch (error) {
      toast.error(error.message || 'No se pudo dar de baja el activo.')
    } finally {
      setRetiringId(null)
    }
  }

  const branchOptions = buildBranchFilterOptions(branches)

  return (
    <>
      <Card className="overflow-hidden" data-testid="activos-table">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center">
          <h3 className="font-heading text-lg font-semibold text-slate-900">Lista de Activos</h3>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar activo..."
                data-testid="activos-search"
                className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
            </div>
            <Button onClick={openNew} data-testid="activos-new-btn">
              <Plus className="h-4 w-4" /> Nuevo activo
            </Button>
          </div>
        </div>

        <div className="space-y-3 border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={branchFilter} onChange={setBranchFilter} options={branchOptions} size="sm" className="min-w-[180px]" data-testid="activos-branch-filter" />
          </div>
          <div className="flex flex-wrap gap-2">
            {categoryFilters.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                data-testid={`activos-filter-cat-${c.id}`}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  category === c.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200'
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatus('all')}
              data-testid="activos-filter-status-all"
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                status === 'all' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
              )}
            >
              Todos los estados
            </button>
            {ACTIVO_STATUSES.map((st) => (
              <button
                key={st.id}
                onClick={() => setStatus(st.id)}
                data-testid={`activos-filter-status-${st.id}`}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  status === st.id ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
                )}
              >
                {st.name}
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-medium text-red-600">
            {loadError}
          </p>
        )}

        {displayRows.length === 0 ? (
          <EmptyState icon={Boxes} title="Sin activos" description="No hay activos con esos filtros." className="py-14" />
        ) : (
          <ResponsiveList minTableWidth={820} columnCount={6}>
            <ResponsiveTable testId="activos-table" wrapCard={false}>
              <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <SortableTh column="name" className="px-5 py-3">Activo</SortableTh>
                    <SortableTh column="category" className="px-5 py-3">Categoría</SortableTh>
                    <SortableTh column="location" className="px-5 py-3">Ubicación</SortableTh>
                    <SortableTh column="status" className="px-5 py-3">Estado</SortableTh>
                    <SortableTh column="value" align="right" className="px-5 py-3">Valor</SortableTh>
                    <SortableTh sortable={false} align="right" className="px-5 py-3">Acciones</SortableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayRows.map((a) => {
                    const st = statusMeta(a.status)
                    return (
                      <tr key={a.id} className="transition-colors hover:bg-slate-50/60" data-testid={`activos-row-${a.id}`}>
                        <td className="px-5 py-4">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-800">{a.name}</p>
                            <p className="text-xs text-slate-400">Código: {a.code || 'N/A'}</p>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-500">{catName(a.category, categories)}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-500">{a.location || '—'}</td>
                        <td className="px-5 py-4">
                          <Badge tone={st.tone}>{st.name}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-heading font-bold text-blue-600">{formatDOP(a.value)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button aria-label={`Editar ${a.name}`} onClick={() => openEdit(a)} data-testid={`activos-edit-${a.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
                              <Pencil className="h-4 w-4" />
                            </button>
                            {a.status !== 'baja' && (
                              <button
                                onClick={() => handleRetire(a)}
                                disabled={retiringId === a.id}
                                title="Dar de baja"
                                aria-label={`Dar de baja ${a.name}`}
                                data-testid={`activos-retire-${a.id}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                              >
                                <ArchiveX className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </SortableTableProvider>
            </ResponsiveTable>
            <ResponsiveCards testId="activos-cards" className="p-4 pt-0">
              {displayRows.map((a) => {
                const st = statusMeta(a.status)
                return (
                  <MobileCard key={a.id} testId={`activos-card-${a.id}`}>
                    <MobileCardHeader
                      title={a.name}
                      subtitle={`Código: ${a.code || 'N/A'}`}
                      badge={<Badge tone={st.tone}>{st.name}</Badge>}
                      actions={
                        <div className="flex items-center gap-1">
                          <button aria-label={`Editar ${a.name}`} onClick={() => openEdit(a)} data-testid={`activos-edit-${a.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                          {a.status !== 'baja' && (
                            <button
                              onClick={() => handleRetire(a)}
                              disabled={retiringId === a.id}
                              title="Dar de baja"
                              aria-label={`Dar de baja ${a.name}`}
                              data-testid={`activos-retire-${a.id}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                            >
                              <ArchiveX className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      }
                    />
                    <MobileCardGrid>
                      <MobileField label="Categoría">{catName(a.category, categories)}</MobileField>
                      <MobileField label="Ubicación">{a.location || '—'}</MobileField>
                      <MobileField label="Valor" fullWidth>
                        <span className="font-heading font-bold text-blue-600">{formatDOP(a.value)}</span>
                      </MobileField>
                    </MobileCardGrid>
                  </MobileCard>
                )
              })}
            </ResponsiveCards>
          </ResponsiveList>
        )}
      </Card>

      <ActivoFormModal open={modalOpen} onClose={() => setModalOpen(false)} activo={editing} />
    </>
  )
}
