import { useState, useMemo } from 'react'
import { Plus, Search, Users, Star, Phone, Mail, ChevronLeft, ChevronRight } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { useConfigStore } from '@/stores/configStore'
import { CUSTOMER_STATUS_META, CUSTOMER_STATUSES } from '@/data/crm'
import { formatDOP, formatNumber } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { CustomerFormModal } from '../components/CustomerFormModal'
import { CustomerDetailModal } from '../components/CustomerDetailModal'
import { AppointmentFormModal } from '@/modules/agenda/components/AppointmentFormModal'
import { WhatsAppMenuButton } from '@/components/ui/WhatsAppMenuButton'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardFooter,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10

function Chip({ label, value, tone }) {
  const tones = { brand: 'text-blue-600', slate: 'text-slate-700', amber: 'text-amber-600' }
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-soft">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={cn('font-heading text-xl font-bold', tones[tone])}>{value}</p>
    </div>
  )
}

export default function ClientesPage() {
  const customers = usePosStore((s) => s.customers)
  const sales = usePosStore((s) => s.sales)
  const branches = useConfigStore((s) => s.branches)

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)
  const [scheduling, setScheduling] = useState(null)

  // Total gastado por cliente (una sola pasada).
  const spentByCustomer = useMemo(() => {
    const map = {}
    sales.forEach((s) => {
      const id = s.customer?.id
      if (!id) return
      map[id] = (map[id] || 0) + (s.total || 0)
    })
    return map
  }, [sales])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers
      .filter((c) => c.id !== 'walk-in')
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) || (c.email && c.email.toLowerCase().includes(q)))
      .filter((c) => typeFilter === 'all' || (c.customerType || 'b2c') === typeFilter)
      .filter((c) => statusFilter === 'all' || (c.customerStatus || 'activo') === statusFilter)
      .filter((c) => branchFilter === 'all' || c.branchId === branchFilter)
  }, [customers, query, typeFilter, statusFilter, branchFilter])

  const { rows: sortedFiltered, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'name', dir: 'asc' },
    accessors: {
      name: (c) => c.name,
      points: (c) => c.points || 0,
      spent: (c) => spentByCustomer[c.id] || 0,
    },
  })

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE))
  const list = useMemo(() => sortedFiltered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [sortedFiltered, page])

  const stats = useMemo(() => {
    const base = customers.filter((c) => c.id !== 'walk-in')
    const conCompras = Object.keys(spentByCustomer).filter((id) => id !== 'walk-in').length
    const totalPts = base.reduce((a, c) => a + (c.points || 0), 0)
    const prospectos = base.filter((c) => (c.customerStatus || 'activo') === 'prospecto').length
    return { total: base.length, conCompras, totalPts, prospectos }
  }, [customers, spentByCustomer])

  const branchOptions = [{ value: 'all', label: 'Todas las sucursales' }, ...branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (c) => { setDetail(null); setEditing(c); setFormOpen(true) }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Chip label="Clientes" value={stats.total} tone="brand" />
        <Chip label="Prospectos" value={stats.prospectos} tone="slate" />
        <Chip label="Con compras" value={stats.conCompras} tone="slate" />
        <Chip label="Puntos acumulados" value={formatNumber(stats.totalPts)} tone="amber" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
              placeholder="Buscar por nombre, teléfono o email..."
              data-testid="clientes-search"
              className="w-full rounded-xl border-0 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </div>
          <Button onClick={openNew} data-testid="clientes-new-btn">
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1">
            {[{ id: 'all', label: 'Todos' }, { id: 'b2c', label: 'B2C' }, { id: 'b2b', label: 'B2B' }].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTypeFilter(t.id); setPage(0) }}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition-all', typeFilter === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(0) }} options={[{ value: 'all', label: 'Todos los estados' }, ...CUSTOMER_STATUSES.map((s) => ({ value: s, label: CUSTOMER_STATUS_META[s].label }))]} className="w-40" />
          <Select value={branchFilter} onChange={(v) => { setBranchFilter(v); setPage(0) }} options={branchOptions} className="w-48" />
        </div>
      </div>

      {list.length === 0 ? (
        <Card className="overflow-hidden">
          <EmptyState icon={Users} title="Sin clientes" description="No hay clientes con esos filtros." className="py-14" />
        </Card>
      ) : (
        <ResponsiveList minTableWidth={760} columnCount={5}>
          <ResponsiveTable testId="clientes-table">
            <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <SortableTh column="name" className="px-6 py-4">Cliente</SortableTh>
                  <SortableTh column="type" sortable={false} className="px-6 py-4">Tipo / Estado</SortableTh>
                  <SortableTh column="contact" sortable={false} className="px-6 py-4">Contacto</SortableTh>
                  <SortableTh column="points" align="center" className="px-6 py-4">Puntos</SortableTh>
                  <SortableTh column="spent" align="right" className="px-6 py-4">Total gastado</SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {list.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setDetail(c)}
                    data-testid={`clientes-row-${c.id}`}
                    className="cursor-pointer transition-colors hover:bg-slate-50/60"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                          {c.name.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-800">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone="neutral">{(c.customerType || 'b2c').toUpperCase()}</Badge>
                        <Badge tone={CUSTOMER_STATUS_META[c.customerStatus || 'activo']?.tone || 'success'}>
                          {CUSTOMER_STATUS_META[c.customerStatus || 'activo']?.label || 'Activo'}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      <div className="flex items-center gap-2">
                        <div className="flex min-w-0 flex-col gap-0.5 text-xs">
                          {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
                          {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>}
                          {!c.phone && !c.email && <span className="text-slate-300">—</span>}
                        </div>
                        {c.phone && (
                          <WhatsAppMenuButton
                            phone={c.phone}
                            context="clientes"
                            size="sm"
                            variables={{ nombre_cliente: c.name, empresa: c.company || '' }}
                            data-testid={`clientes-wa-${c.id}`}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-600"><Star className="h-3.5 w-3.5" /> {c.points || 0}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-slate-900">{formatDOP(spentByCustomer[c.id] || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="clientes-cards">
            {list.map((c) => (
              <MobileCard key={c.id} onClick={() => setDetail(c)} testId={`clientes-card-${c.id}`}>
                <MobileCardHeader
                  title={c.name}
                  badge={
                    <div className="flex items-center gap-1">
                      {c.phone && (
                        <WhatsAppMenuButton
                          phone={c.phone}
                          context="clientes"
                          size="sm"
                          variables={{ nombre_cliente: c.name, empresa: c.company || '' }}
                          data-testid={`clientes-wa-card-${c.id}`}
                        />
                      )}
                      <div className="flex flex-wrap justify-end gap-1">
                        <Badge tone="neutral">{(c.customerType || 'b2c').toUpperCase()}</Badge>
                        <Badge tone={CUSTOMER_STATUS_META[c.customerStatus || 'activo']?.tone || 'success'}>
                          {CUSTOMER_STATUS_META[c.customerStatus || 'activo']?.label || 'Activo'}
                        </Badge>
                      </div>
                    </div>
                  }
                />
                <MobileCardGrid>
                  <MobileField label="Teléfono">
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>
                    ) : '—'}
                  </MobileField>
                  <MobileField label="Email">
                    {c.email ? (
                      <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" /> {c.email}</span>
                    ) : '—'}
                  </MobileField>
                  <MobileField label="Puntos">
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-600"><Star className="h-3.5 w-3.5" /> {c.points || 0}</span>
                  </MobileField>
                  <MobileField label="Total gastado">
                    <span className="font-heading font-bold text-slate-900">{formatDOP(spentByCustomer[c.id] || 0)}</span>
                  </MobileField>
                </MobileCardGrid>
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
      )}

      {sortedFiltered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Página {page + 1} de {totalPages} · {sortedFiltered.length} clientes</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} customer={editing} />
      <CustomerDetailModal open={!!detail} onClose={() => setDetail(null)} customer={detail} onEdit={openEdit} onSchedule={(c) => { setDetail(null); setScheduling(c) }} />
      <AppointmentFormModal open={!!scheduling} onClose={() => setScheduling(null)} defaultCustomerId={scheduling?.id} />
    </div>
  )
}
