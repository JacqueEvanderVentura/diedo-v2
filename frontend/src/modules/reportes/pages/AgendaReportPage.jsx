import { useState, useMemo } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { CalendarCheck, UserX, CalendarClock, Percent } from 'lucide-react'
import { useAgendaStore, toKey } from '@/stores/agendaStore'
import { PeriodFilter } from '../components/PeriodFilter'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import { inPeriod } from '../lib/reportes'

const STATUS_META = [
  { id: 'completada', name: 'Cumplidas', color: '#10b981' },
  { id: 'confirmada', name: 'Confirmadas', color: '#3b82f6' },
  { id: 'pendiente', name: 'Pendientes', color: '#f59e0b' },
  { id: 'noshow', name: 'No-show', color: '#ef4444' },
  { id: 'cancelada', name: 'Canceladas', color: '#94a3b8' },
]
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export default function AgendaReportPage() {
  const appointments = useAgendaStore((s) => s.appointments)
  const [period, setPeriod] = useState('month')

  const filtered = useMemo(() => appointments.filter((a) => inPeriod(a.date, period)), [appointments, period])

  const counts = useMemo(() => {
    const c = { completada: 0, confirmada: 0, pendiente: 0, noshow: 0, cancelada: 0 }
    filtered.forEach((a) => { c[a.status] = (c[a.status] || 0) + 1 })
    return c
  }, [filtered])

  const cumplidas = counts.completada
  const noShow = counts.noshow
  const asistencia = cumplidas + noShow > 0 ? Math.round((cumplidas / (cumplidas + noShow)) * 100) : 0

  const pie = useMemo(
    () => STATUS_META.map((s) => ({ ...s, value: counts[s.id] || 0 })).filter((s) => s.value > 0),
    [counts]
  )

  // Cumplidas vs No-show — últimos 7 días (datos reales de la agenda).
  const weekly = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
      const key = toKey(d)
      const dayAppts = appointments.filter((a) => a.date === key)
      return {
        label: `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`,
        Cumplidas: dayAppts.filter((a) => a.status === 'completada').length,
        'No-show': dayAppts.filter((a) => a.status === 'noshow').length,
      }
    })
  }, [appointments])

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <PeriodFilter period={period} onChange={setPeriod} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Citas (período)" value={filtered.length} icon={CalendarClock} tone="brand" testId="report-stat-citas" />
        <StatCard label="Cumplidas" value={cumplidas} icon={CalendarCheck} tone="emerald" testId="report-stat-cumplidas" />
        <StatCard label="No-show" value={noShow} icon={UserX} tone="red" testId="report-stat-noshow" />
        <StatCard label="Tasa de asistencia" value={`${asistencia}%`} icon={Percent} tone="violet" sub="Cumplidas vs no-show" testId="report-stat-asistencia" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard title="Distribución por estado" subtitle="Citas del período" testId="report-agenda-status">
          {pie.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin citas en el período</p>
          ) : (
            <>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height={220} minWidth={0}>
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} isAnimationActive={false}>
                      {pie.map((e) => <Cell key={e.id} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {pie.map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} /> {e.name}</span>
                    <span className="font-semibold text-slate-800">{e.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard title="Cumplidas vs No-show" subtitle="Últimos 7 días (datos reales)" testId="report-agenda-weekly">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                <BarChart data={weekly} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} width={32} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Cumplidas" fill="#10b981" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="No-show" fill="#ef4444" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
