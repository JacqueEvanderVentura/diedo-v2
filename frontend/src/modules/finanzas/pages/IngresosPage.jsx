import { useState, useMemo } from 'react'
import * as Icons from 'lucide-react'
import { TrendingUp, Receipt, Hash } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { formatDOP } from '@/lib/format'
import { fmtWhen, isThisMonth } from '../lib/finanzas'
import { METHOD_LABELS, METHOD_ICON } from '@/modules/crm/lib/crm'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'

function SummaryCard({ label, value, icon: Icon, tone }) {
  const tones = { emerald: 'text-emerald-600 bg-emerald-50', brand: 'text-blue-600 bg-blue-50', slate: 'text-slate-600 bg-slate-100' }
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-soft">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="truncate font-heading text-lg font-bold text-slate-800">{value}</p>
      </div>
    </div>
  )
}

const PERIODS = [{ id: 'month', label: 'Mes actual' }, { id: 'all', label: 'Todo' }]

export default function IngresosPage() {
  const sales = usePosStore((s) => s.sales)
  const [period, setPeriod] = useState('month')

  const inPeriod = (v) => period === 'all' || isThisMonth(v)

  const filtered = useMemo(
    () => sales.filter((s) => inPeriod(s.createdAt)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [sales, period]
  )

  const total = useMemo(() => filtered.reduce((a, s) => a + (s.total || 0), 0), [filtered])
  const ticket = filtered.length ? total / filtered.length : 0

  const byMethod = useMemo(() => {
    const map = {}
    filtered.forEach((s) => { map[s.method] = (map[s.method] || 0) + (s.total || 0) })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      {/* Info banner */}
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-700" data-testid="ingresos-banner">
        <TrendingUp className="h-4 w-4 shrink-0" />
        Los ingresos se generan automáticamente desde las ventas registradas en el POS.
      </div>

      {/* Period toggle */}
      <div className="flex rounded-xl bg-slate-100 p-1 w-fit">
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)} data-testid={`ingresos-period-${p.id}`}
            className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition-colors', period === p.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500')}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Ingresos totales" value={formatDOP(total)} icon={TrendingUp} tone="emerald" />
        <SummaryCard label="N.º de ventas" value={filtered.length} icon={Hash} tone="brand" />
        <SummaryCard label="Ticket promedio" value={formatDOP(ticket)} icon={Receipt} tone="slate" />
      </div>

      {/* Breakdown by method */}
      {byMethod.length > 0 && (
        <div>
          <h3 className="mb-3 font-heading text-lg font-bold text-slate-800">Desglose por método</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="ingresos-breakdown">
            {byMethod.map(([method, amount]) => {
              const Icon = Icons[METHOD_ICON[method]] || Icons.Circle
              const pct = total > 0 ? Math.round((amount / total) * 100) : 0
              return (
                <Card key={method} className="p-4" data-testid={`ingresos-method-${method}`}>
                  <div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="text-xs font-semibold">{METHOD_LABELS[method] || method}</span></div>
                  <p className="mt-2 font-heading text-lg font-bold text-slate-900">{formatDOP(amount)}</p>
                  <p className="text-xs text-slate-400">{pct}% del total</p>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden" data-testid="ingresos-table">
        {filtered.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin ingresos" description="No hay ventas en este período." className="py-12" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Método</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((s) => {
                  const Icon = Icons[METHOD_ICON[s.method]] || Icons.Circle
                  return (
                    <tr key={s.id} className="transition-colors hover:bg-slate-50/60" data-testid={`ingresos-row-${s.id}`}>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{fmtWhen(s.createdAt)}</td>
                      <td className="whitespace-nowrap px-6 py-4 font-semibold text-slate-800">{s.customer?.name || 'Cliente Mostrador'}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-600"><Icon className="h-4 w-4 text-slate-400" /> {METHOD_LABELS[s.method] || s.method}</span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-emerald-600">+ {formatDOP(s.total)}</td>
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
