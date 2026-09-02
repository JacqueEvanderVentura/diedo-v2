import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  Receipt,
  PiggyBank,
  CreditCard,
  BarChart3,
  ArrowRight,
  FileText,
} from 'lucide-react'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { usePosStore } from '@/stores/posStore'
import { formatDOP, formatCompact } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ExportMenu } from '../components/ExportMenu'
import { cn } from '@/lib/utils'

const NAV_CARDS = [
  { title: 'Resumen Financiero', desc: 'Vista general de P&L, flujo de caja y reportes', to: '/reportes/generales', metric: 'utilidad neta', icon: BarChart3, tone: 'brand' },
  { title: 'Gestión de Gastos', desc: 'Registrar, categorizar y aprobar gastos', to: '/finanzas/gastos', metric: 'Ver histórico', icon: Receipt, tone: 'red' },
  { title: 'Control de Presupuestos', desc: 'Planificación y control por categoría', to: '/finanzas/presupuestos', metric: 'Gestionar', icon: PiggyBank, tone: 'purple' },
  { title: 'Ingresos & Revenue', desc: 'Seguimiento de transacciones y facturación', to: '/finanzas/ingresos', metric: 'este mes', icon: TrendingUp, tone: 'emerald' },
  { title: 'Deudas y Pasivos', desc: 'Gestión de préstamos y tarjetas por sucursal', to: '/finanzas/pasivos', metric: 'Gestionar deudas', icon: CreditCard, tone: 'amber' },
  { title: 'Gastos Fijos', desc: 'Costos operativos recurrentes', to: '/finanzas/gastos?tab=fijos', metric: 'Configurar fijos', icon: Wallet, tone: 'slate' },
]

function KpiCard({ label, value, icon: Icon, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    brand: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-2.5 shadow-md">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="font-heading text-sm font-bold text-slate-900">{formatDOP(payload[0].value)}</p>
    </div>
  )
}

export default function OverviewPage() {
  const sales = usePosStore((s) => s.sales)
  const getOverviewStats = useFinanzasStore((s) => s.getOverviewStats)
  const getIncomeTrend = useFinanzasStore((s) => s.getIncomeTrend)

  const stats = useMemo(() => getOverviewStats(sales), [sales, getOverviewStats])
  const trend = useMemo(() => getIncomeTrend(sales), [sales, getIncomeTrend])

  const exportRows = useMemo(
    () => [
      { concepto: 'Ingresos del mes', monto: formatDOP(stats.ingresosMes) },
      { concepto: 'Gastos del mes', monto: formatDOP(stats.gastosMes) },
      { concepto: 'Balance mensual', monto: formatDOP(stats.balance) },
      { concepto: 'Alertas activas', monto: String(stats.alertas) },
      ...trend.map((p) => ({ concepto: `Ingresos ${p.label}`, monto: formatDOP(p.value) })),
    ],
    [stats, trend]
  )

  const exportCols = [
    { key: 'concepto', label: 'Concepto' },
    { key: 'monto', label: 'Monto' },
  ]

  const margen = stats.netMarginPercent == null
    ? stats.ingresosMes > 0 ? ((stats.balance / stats.ingresosMes) * 100).toFixed(1) : '0.0'
    : Number(stats.netMarginPercent).toFixed(1)

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="finanzas-overview">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Centro Financiero</h2>
          <p className="text-sm text-slate-500">Resumen ejecutivo de ingresos, gastos y balance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportMenu title="Centro Financiero" columns={exportCols} rows={exportRows} filename="centro_financiero" subtitle="Resumen mensual" />
          <Button variant="secondary" onClick={() => window.open('/reportes/generales', '_self')} data-testid="finanzas-generar-reporte">
            <FileText className="h-4 w-4" />
            Generar Reporte
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Ingresos del Mes" value={formatDOP(stats.ingresosMes)} icon={TrendingUp} tone="emerald" />
        <KpiCard label="Gastos del Mes" value={formatDOP(stats.gastosMes)} icon={TrendingDown} tone="red" />
        <KpiCard label="Balance Mensual" value={formatDOP(stats.balance)} icon={Wallet} tone="brand" />
        <KpiCard label="Alertas" value={stats.alertas} icon={AlertTriangle} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2" data-testid="finanzas-trend-chart">
          <h3 className="font-heading text-lg font-semibold text-slate-800">Tendencia de Ingresos (Últimos 6 meses)</h3>
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trend} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="finGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={formatCompact} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2.5} fill="url(#finGradient)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6" data-testid="finanzas-pl-panel">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-lg font-semibold text-slate-800">P&L Rápido</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">Mes actual</span>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <span className="text-sm text-slate-500">Utilidad Bruta (Est.)</span>
              <span className="font-heading font-bold text-slate-900">{formatDOP(stats.grossProfitEstimate ?? stats.ingresosMes * 0.7)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <span className="text-sm text-slate-500">Gastos Op.</span>
              <span className="font-heading font-bold text-red-500">{formatDOP(stats.gastosMes)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <span className="text-sm text-slate-500">EBITDA</span>
              <span className="font-heading font-bold text-blue-600">{formatDOP(stats.balance)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Margen Neto</span>
              <span className="font-heading font-bold text-slate-900">{margen}%</span>
            </div>
          </div>
          <Link to="/reportes/generales" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200">
            Ver Detalle Completo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {NAV_CARDS.map((c) => {
          const Icon = c.icon
          const metricValue = c.title.includes('Ingresos') ? formatDOP(stats.ingresosMes) : c.title.includes('Resumen') ? formatDOP(stats.balance) : c.metric
          return (
            <Link key={c.to} to={c.to} data-testid={`finanzas-nav-${c.title}`} className="group rounded-xl border border-slate-100 bg-white p-5 shadow-soft transition-all hover:border-blue-200 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', c.tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : c.tone === 'red' ? 'bg-red-50 text-red-600' : c.tone === 'purple' ? 'bg-purple-50 text-purple-600' : c.tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600')}>
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
              </div>
              <h4 className="mt-4 font-heading font-bold text-slate-900">{c.title}</h4>
              <p className="mt-1 text-sm text-slate-500">{c.desc}</p>
              <p className="mt-3 text-xs font-semibold text-blue-600">{metricValue}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
