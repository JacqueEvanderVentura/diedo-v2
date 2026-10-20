import { useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Legend,
} from 'recharts'
import { Users, TrendingDown, TrendingUp, Filter } from 'lucide-react'
import { formatDOP, formatNumber } from '@/lib/format'
import { CHART_ANIMATION } from '@/lib/chartAnimation'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import { AGENDA_REPORT_PERIODS } from '../lib/reportes'
import { fetchPipelineSummary } from '@/services/reportApi'
import { useReportSummary } from '../hooks/useReportSummary'
import { useReportFilters } from '../hooks/useReportFilters'
import { formatDwellHours } from '../lib/pipelineReport'

function RateTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="font-heading text-sm font-bold text-slate-800">
          {p.name}: {Number(p.value).toFixed(1)}%
        </p>
      ))}
    </div>
  )
}

function DwellTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-400">{label || row?.label}</p>
      <p className="font-heading text-sm font-bold text-slate-800">
        Promedio: {formatDwellHours(row?.avgHours)}
      </p>
      <p className="text-xs text-slate-500">Muestras: {row?.sampleCount ?? 0}</p>
    </div>
  )
}

const EMPTY_SUMMARY = {
  totalLeads: 0,
  withOriginPct: 0,
  wonCount: 0,
  lostCount: 0,
  lossRate: null,
  winRate: null,
  openPipelineCount: 0,
  openPipelineValue: 0,
  byOrigin: [],
  byStage: [],
  stageDwell: [],
  stageDwellByOrigin: [],
  lostReasons: [],
}

export default function PipelineReportPage() {
  const { period, branchIds, setBranchIds, onPeriodChange, params } = useReportFilters({
    period: 'month',
  })

  const fetcher = useCallback(() => fetchPipelineSummary(params), [params])
  const { data, loading, error, reload } = useReportSummary(fetcher, EMPTY_SUMMARY)
  const summary = data || EMPTY_SUMMARY

  const originVolume = summary.byOrigin.map((row) => ({
    name: row.label,
    leads: row.count,
    fill: row.color,
  }))

  const originLoss = summary.byOrigin
    .filter((row) => row.lossRate != null && row.won + row.lost > 0)
    .map((row) => ({
      name: row.label,
      lossRate: row.lossRate,
      fill: row.color,
    }))

  const dwellChart = summary.stageDwell
    .filter((row) => row.sampleCount > 0 && row.avgHours != null)
    .map((row) => ({
      label: row.label,
      avgHours: row.avgHours,
      sampleCount: row.sampleCount,
    }))

  return (
    <div className="space-y-6" data-testid="pipeline-report-page">
      <ReportFilterBar
        branchIds={branchIds}
        onBranchIdsChange={setBranchIds}
        period={period}
        onPeriodChange={onPeriodChange}
        showPeriod
        periodOptions={AGENDA_REPORT_PERIODS}
        showSearch={false}
        onRefresh={reload}
        testId="pipeline-report-filters"
      />

      {error && (
        <p className="text-sm text-red-600" role="alert">
          No se pudo cargar el reporte de pipeline.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Leads (cohorte)"
          value={loading ? '…' : formatNumber(summary.totalLeads)}
          sub={`${summary.withOriginPct.toFixed(0)}% con origen registrado`}
          tone="brand"
        />
        <StatCard
          icon={TrendingUp}
          label="Ganados"
          value={loading ? '…' : formatNumber(summary.wonCount)}
          sub={
            summary.winRate != null ? `Tasa de cierre ${summary.winRate.toFixed(1)}%` : 'Sin cierres en cohorte'
          }
          tone="emerald"
        />
        <StatCard
          icon={TrendingDown}
          label="Perdidos"
          value={loading ? '…' : formatNumber(summary.lostCount)}
          sub={
            summary.lossRate != null ? `Tasa de pérdida ${summary.lossRate.toFixed(1)}%` : 'Sin pérdidas en cohorte'
          }
          tone="red"
        />
        <StatCard
          icon={Filter}
          label="Pipeline abierto"
          value={loading ? '…' : formatNumber(summary.openPipelineCount)}
          sub={loading ? '' : formatDOP(summary.openPipelineValue)}
          tone="amber"
        />
      </div>

      <p className="text-xs text-slate-500">
        Cohorte: leads creados en el período seleccionado. Tiempos reconstruidos de movimientos de etapa;
        importaciones sin historial no entran al promedio.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {originVolume.length > 0 && (
          <ChartCard title="Leads por origen" subtitle="WhatsApp, Instagram, AI y otros canales">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={originVolume} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="leads" name="Leads" radius={[6, 6, 0, 0]} animationDuration={CHART_ANIMATION.duration}>
                  {originVolume.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {originLoss.length > 0 && (
          <ChartCard
            title="Tasa de pérdida por origen"
            subtitle="% sobre cerrados (ganado + perdido) por canal"
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={originLoss} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis unit="%" tick={{ fontSize: 11 }} />
                <Tooltip content={<RateTip />} />
                <Bar dataKey="lossRate" name="Pérdida" radius={[6, 6, 0, 0]} animationDuration={CHART_ANIMATION.duration}>
                  {originLoss.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {dwellChart.length > 0 && (
          <div className="lg:col-span-2">
          <ChartCard
            title="Tiempo promedio en etapa"
            subtitle="Horas hasta salir de la etapa (solo con movimientos registrados)"
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dwellChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => formatDwellHours(v)} tick={{ fontSize: 11 }} />
                <Tooltip content={<DwellTip />} />
                <Legend />
                <Bar
                  dataKey="avgHours"
                  name="Promedio"
                  fill="#8b5cf6"
                  radius={[6, 6, 0, 0]}
                  animationDuration={CHART_ANIMATION.duration}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          </div>
        )}
      </div>

      {summary.lostReasons.length > 0 && (
        <ChartCard title="Motivos de pérdida" subtitle="Texto libre al marcar como perdido">
          <ul className="divide-y divide-slate-100">
            {summary.lostReasons.map((row) => (
              <li key={row.reason} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">{row.reason}</span>
                <span className="font-medium text-slate-900">{row.count}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}

      {summary.stageDwellByOrigin.length > 0 && (
        <ChartCard
          title="Tiempo en Nuevo y Contactado por origen"
          subtitle="Promedio de horas antes de avanzar (muestras con historial)"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="py-2 pr-4 font-medium">Origen</th>
                  <th className="py-2 pr-4 font-medium">Nuevo</th>
                  <th className="py-2 font-medium">Contactado</th>
                </tr>
              </thead>
              <tbody>
                {summary.stageDwellByOrigin.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-800">{row.label}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {formatDwellHours(row.nuevo.avgHours)}
                      {row.nuevo.sampleCount > 0 && (
                        <span className="ml-1 text-xs text-slate-400">(n={row.nuevo.sampleCount})</span>
                      )}
                    </td>
                    <td className="py-2 text-slate-600">
                      {formatDwellHours(row.contactado.avgHours)}
                      {row.contactado.sampleCount > 0 && (
                        <span className="ml-1 text-xs text-slate-400">(n={row.contactado.sampleCount})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {!loading && summary.totalLeads === 0 && (
        <p className="text-center text-sm text-slate-500">No hay leads creados en este período.</p>
      )}
    </div>
  )
}
