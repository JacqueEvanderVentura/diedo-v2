import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Search, Boxes, Wrench, PackageX, Landmark } from 'lucide-react'
import { useActivosStore, ACTIVO_CATEGORIES, ACTIVO_STATUSES, statusMeta, catName } from '@/stores/activosStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ActivoFormModal } from '../components/ActivoFormModal'
import { cn } from '@/lib/utils'

function StatCard({ label, value, icon: Icon, tone }) {
  const tones = {
    brand: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    slate: 'text-slate-600 bg-slate-100',
  }
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-soft">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="truncate font-heading text-xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  )
}

const CAT_FILTERS = [{ id: 'all', name: 'Todos' }, ...ACTIVO_CATEGORIES]

export default function ActivosPage() {
  const activos = useActivosStore((s) => s.activos)
  const deleteActivo = useActivosStore((s) => s.deleteActivo)
  const getStats = useActivosStore((s) => s.getStats)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [status, setStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const stats = getStats()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activos.filter((a) => {
      const matchCat = category === 'all' || a.category === category
      const matchStatus = status === 'all' || a.status === status
      const matchQ = !q || a.name.toLowerCase().includes(q) || (a.code && String(a.code).toLowerCase().includes(q))
      return matchCat && matchStatus && matchQ
    })
  }, [activos, query, category, status])

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (a) => { setEditing(a); setModalOpen(true) }
  const handleDelete = (a) => { deleteActivo(a.id); toast.success(`"${a.name}" eliminado`) }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Valor total (activos)" value={formatDOP(stats.totalValue)} icon={Landmark} tone="brand" />
        <StatCard label="Operativos" value={stats.operativos} icon={Boxes} tone="emerald" />
        <StatCard label="En reparación" value={stats.reparacion} icon={Wrench} tone="amber" />
        <StatCard label="Dados de baja" value={stats.baja} icon={PackageX} tone="slate" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o código..."
            data-testid="activos-search"
            className="w-full rounded-xl border-0 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </div>
        <Button onClick={openNew} data-testid="activos-new-btn">
          <Plus className="h-4 w-4" /> Nuevo activo
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {CAT_FILTERS.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)} data-testid={`activos-filter-cat-${c.id}`}
              className={cn('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors', category === c.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200')}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStatus('all')} data-testid="activos-filter-status-all"
            className={cn('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors', status === 'all' ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400')}>
            Todos los estados
          </button>
          {ACTIVO_STATUSES.map((st) => (
            <button key={st.id} onClick={() => setStatus(st.id)} data-testid={`activos-filter-status-${st.id}`}
              className={cn('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors', status === st.id ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400')}>
              {st.name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden" data-testid="activos-table">
        {filtered.length === 0 ? (
          <EmptyState icon={Boxes} title="Sin activos" description="No hay activos con esos filtros." className="py-14" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Activo</th>
                  <th className="px-6 py-4">Categoría</th>
                  <th className="px-6 py-4">Ubicación</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Valor</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((a) => {
                  const st = statusMeta(a.status)
                  return (
                    <tr key={a.id} className="transition-colors hover:bg-slate-50/60" data-testid={`activos-row-${a.id}`}>
                      <td className="px-6 py-4">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{a.name}</p>
                          <p className="text-xs text-slate-400">Código: {a.code || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{catName(a.category)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{a.location || '—'}</td>
                      <td className="px-6 py-4"><Badge tone={st.tone}>{st.name}</Badge></td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-blue-600">{formatDOP(a.value)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(a)} data-testid={`activos-edit-${a.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(a)} data-testid={`activos-delete-${a.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ActivoFormModal open={modalOpen} onClose={() => setModalOpen(false)} activo={editing} />
    </div>
  )
}
