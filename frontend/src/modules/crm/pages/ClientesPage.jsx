import { useState, useMemo } from 'react'
import { Plus, Search, Users, Star, Phone, Mail } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { formatDOP, formatNumber } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { CustomerFormModal } from '../components/CustomerFormModal'
import { CustomerDetailModal } from '../components/CustomerDetailModal'
import { AppointmentFormModal } from '@/modules/agenda/components/AppointmentFormModal'
import { cn } from '@/lib/utils'

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

  const [query, setQuery] = useState('')
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

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers
      .filter((c) => c.id !== 'walk-in')
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) || (c.email && c.email.toLowerCase().includes(q)))
  }, [customers, query])

  const stats = useMemo(() => {
    const conCompras = Object.keys(spentByCustomer).filter((id) => id !== 'walk-in').length
    const totalPts = customers.filter((c) => c.id !== 'walk-in').reduce((a, c) => a + (c.points || 0), 0)
    return { total: customers.filter((c) => c.id !== 'walk-in').length, conCompras, totalPts }
  }, [customers, spentByCustomer])

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (c) => { setDetail(null); setEditing(c); setFormOpen(true) }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Chip label="Clientes" value={stats.total} tone="brand" />
        <Chip label="Con compras" value={stats.conCompras} tone="slate" />
        <Chip label="Puntos acumulados" value={formatNumber(stats.totalPts)} tone="amber" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email..."
            data-testid="clientes-search"
            className="w-full rounded-xl border-0 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </div>
        <Button onClick={openNew} data-testid="clientes-new-btn">
          <Plus className="h-4 w-4" /> Nuevo cliente
        </Button>
      </div>

      <Card className="overflow-hidden" data-testid="clientes-table">
        {list.length === 0 ? (
          <EmptyState icon={Users} title="Sin clientes" description="No hay clientes con esos filtros." className="py-14" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Contacto</th>
                  <th className="px-6 py-4 text-center">Puntos</th>
                  <th className="px-6 py-4 text-right">Total gastado</th>
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
                    <td className="px-6 py-4 text-slate-500">
                      <div className="flex flex-col gap-0.5 text-xs">
                        {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
                        {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>}
                        {!c.phone && !c.email && <span className="text-slate-300">—</span>}
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
          </div>
        )}
      </Card>

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} customer={editing} />
      <CustomerDetailModal open={!!detail} onClose={() => setDetail(null)} customer={detail} onEdit={openEdit} onSchedule={(c) => { setDetail(null); setScheduling(c) }} />
      <AppointmentFormModal open={!!scheduling} onClose={() => setScheduling(null)} defaultCustomerId={scheduling?.id} />
    </div>
  )
}
