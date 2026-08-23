import { useState, useMemo } from 'react'
import * as Icons from 'lucide-react'
import { Search, ShoppingBag } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { fmtDateTime, METHOD_LABELS, METHOD_ICON } from '../lib/crm'
import { cn } from '@/lib/utils'

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'link', label: 'Link' },
  { id: 'cxc', label: 'Cta. Cobrar' },
]

function Chip({ label, value, tone }) {
  const tones = { brand: 'text-blue-600', slate: 'text-slate-700' }
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-soft">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={cn('font-heading text-xl font-bold', tones[tone])}>{value}</p>
    </div>
  )
}

export default function VentasPage() {
  const sales = usePosStore((s) => s.sales)
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sales
      .filter((s) => method === 'all' || s.method === method)
      .filter((s) => !q || (s.customer?.name || '').toLowerCase().includes(q) || (s.reference || '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [sales, query, method])

  const stats = useMemo(() => {
    const total = filtered.reduce((a, s) => a + (s.total || 0), 0)
    return { count: filtered.length, total }
  }, [filtered])

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-4">
        <Chip label="Ventas (filtro actual)" value={stats.count} tone="slate" />
        <Chip label="Monto total" value={formatDOP(stats.total)} tone="brand" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente o referencia..."
            data-testid="ventas-search"
            className="w-full rounded-xl border-0 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setMethod(f.id)} data-testid={`ventas-filter-${f.id}`}
            className={cn('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors', method === f.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200')}>
            {f.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden" data-testid="ventas-table">
        {filtered.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Sin ventas" description="No hay ventas con esos filtros." className="py-14" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Artículos</th>
                  <th className="px-6 py-4">Método</th>
                  <th className="px-6 py-4">Referencia</th>
                  <th className="px-6 py-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((s) => {
                  const Icon = Icons[METHOD_ICON[s.method]] || Icons.Circle
                  return (
                    <tr key={s.id} className="transition-colors hover:bg-slate-50/60" data-testid={`ventas-row-${s.id}`}>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{fmtDateTime(s.createdAt)}</td>
                      <td className="whitespace-nowrap px-6 py-4 font-semibold text-slate-800">{s.customer?.name || 'Cliente Mostrador'}</td>
                      <td className="max-w-[240px] truncate px-6 py-4 text-slate-500">{s.items?.map((i) => `${i.qty}× ${i.name}`).join(', ')}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-600"><Icon className="h-4 w-4 text-slate-400" /> {METHOD_LABELS[s.method] || s.method}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{s.reference || '—'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-blue-600">{formatDOP(s.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
