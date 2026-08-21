import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Card } from '@/components/ui/Card'
import { formatDOP, formatCompact } from '@/lib/format'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-2.5 shadow-md">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="font-heading text-sm font-bold text-slate-900">{formatDOP(payload[0].value)}</p>
    </div>
  )
}

export function SalesChart({ trend }) {
  return (
    <Card className="p-6" data-testid="dashboard-sales-chart">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="font-heading text-lg font-semibold tracking-tight text-slate-800">
            Tendencia de Ventas
          </h3>
          <p className="text-sm text-slate-400">Rendimiento del período</p>
        </div>
        <p className="font-heading text-2xl font-bold tracking-tight text-blue-600 sm:text-3xl">
          {formatDOP(trend.total)}
        </p>
      </div>
      <div className="h-[280px] min-h-[280px] w-full">
        <ResponsiveContainer width="100%" height={280} minWidth={0}>
          <AreaChart data={trend.points} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              dy={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={formatCompact}
              width={56}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#059669"
              strokeWidth={2.5}
              fill="url(#salesGradient)"
              isAnimationActive={false}
              activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
