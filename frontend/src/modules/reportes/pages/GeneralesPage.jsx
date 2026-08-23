import { useState, useMemo } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp, Hash, Receipt } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { formatDOP, formatCompact } from '@/lib/format'
import { METHOD_LABELS } from '@/modules/crm/lib/crm'
import { PeriodFilter } from '../components/PeriodFilter'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import { inPeriod, buildSeries } from '../lib/reportes'

const METHOD_COLORS = { efectivo: '#10b981', tarjeta: '#3b82f6', transferencia: '#8b5cf6', link: '#f59e0b', cxc: '#ef4444' }

function MoneyTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-400">{label ?? payload[0].name}</p>
      <p className="font-heading text-sm font-bold text-slate-900">{formatDOP(payload[0].value)}</p>
    </div>
  )
}

export default function GeneralesPage() {
  const sales = usePosStore((s) => s.sales)
  const [period, setPeriod] = useState('week')

  const filtered = useMemo(() => sales.filter((s) => inPeriod(s.createdAt, period)), [sales, period])
  const total = useMemo(() => filtered.reduce((a, s) => a + (s.total || 0), 0), [filtered])
  const ticket = filtered.length ? total / filtered.length : 0

  const daily = useMemo(() => buildSeries(filtered, period, (s) => s.createdAt, (s) => s.total || 0), [filtered, period])
  const byMethod = useMemo(() => {
    const map = {}
    filtered.forEach((s) => { map[s.method] = (map[s.method] || 0) + (s.total || 0) })
    return Object.entries(map).map(([id, value]) => ({ id, name: METHOD_LABELS[id] || id, value }))
  }, [filtered])

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <PeriodFilter period={period} onChange={setPeriod} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Ingresos totales" value={formatDOP(total)} icon={TrendingUp} tone="emerald" testId="report-stat-ingresos" />
        <StatCard label="N.º de ventas" value={filtered.length} icon={Hash} tone="brand" testId="report-stat-ventas" />
        <StatCard label="Ticket promedio" value={formatDOP(ticket)} icon={Receipt} tone="slate" testId="report-stat-ticket" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Ventas por día" subtitle="Monto vendido en el período" testId="report-sales-daily">
            {filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">Sin ventas en el período</p>
            ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                <BarChart data={daily} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={formatCompact} width={56} />
                  <Tooltip content={<MoneyTip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
          </ChartCard>
        </div>

        <ChartCard title="Ventas por método" subtitle="Distribución del ingreso" testId="report-sales-method">
          {byMethod.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin ventas en el período</p>
          ) : (
            <>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height={220} minWidth={0}>
                  <PieChart>
                    <Pie data={byMethod} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} isAnimationActive={false}>
                      {byMethod.map((e) => <Cell key={e.id} fill={METHOD_COLORS[e.id] || '#94a3b8'} />)}
                    </Pie>
                    <Tooltip content={<MoneyTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {byMethod.map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: METHOD_COLORS[e.id] || '#94a3b8' }} /> {e.name}
                    </span>
                    <span className="font-semibold text-slate-800">{formatDOP(e.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
