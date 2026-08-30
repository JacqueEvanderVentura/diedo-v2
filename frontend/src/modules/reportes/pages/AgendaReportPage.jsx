import { useState, useMemo, useCallback } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { CalendarCheck, UserX, CalendarClock, Percent, Globe, Ban, Eye, Pencil } from 'lucide-react'
import { useAgendaStore, toKey, statusMeta } from '@/stores/agendaStore'
import { useConfigStore } from '@/stores/configStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { ReportFilterBar } from '../components/ReportFilterBar'
import { Pagination } from '../components/Pagination'
import { StatCard, ChartCard } from '../components/ReportPrimitives'
import { inAppointmentPeriod, AGENDA_REPORT_PERIODS } from '../lib/reportes'
import { fetchAgendaReport } from '@/services/reportApi'
import { usePaginatedReport } from '../hooks/usePaginatedReport'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { AppointmentAuditModal } from '../components/AppointmentAuditModal'
import { AppointmentFormModal } from '@/modules/agenda/components/AppointmentFormModal'
import { formatCompactDate } from '@/modules/agenda/lib/calendar'

const STATUS_META = [
  { id: 'completada', name: 'Cumplidas', color: '#10b981' },
  { id: 'confirmada', name: 'Confirmadas', color: '#3b82f6' },
  { id: 'pendiente', name: 'Pendientes', color: '#f59e0b' },
  { id: 'noshow', name: 'No-show', color: '#ef4444' },
  { id: 'cancelada', name: 'Canceladas', color: '#94a3b8' },
  { id: 'retrasada', name: 'Retrasadas', color: '#f59e0b' },
  { id: 'reprogramada', name: 'Reprogramadas', color: '#3b82f6' },
  { id: 'asistio', name: 'Asistió', color: '#10b981' },
]
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export default function AgendaReportPage() {
  const appointments = useAgendaStore((s) => s.appointments)
  const branches = useConfigStore((s) => s.branches)
  const [period, setPeriod] = useState('month')
  const [branchId, setBranchId] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [auditId, setAuditId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)

  const auditAppointment = useMemo(
    () => (auditId ? appointments.find((a) => a.id === auditId) : null),
    [appointments, auditId]
  )

  const openEdit = (apt) => {
    setEditing(apt)
    setFormOpen(true)
  }

  const editingAppointment = useMemo(
    () => (editing ? appointments.find((a) => a.id === editing.id) || editing : null),
    [appointments, editing]
  )

  const filtered = useMemo(
    () => appointments.filter((a) => inAppointmentPeriod(a.date, period) && (!branchId || a.branchId === branchId) && (!status || a.status === status)),
    [appointments, period, branchId, status]
  )

  const counts = useMemo(() => {
    const c = { completada: 0, confirmada: 0, pendiente: 0, noshow: 0, cancelada: 0 }
    filtered.forEach((a) => { c[a.status] = (c[a.status] || 0) + 1 })
    return c
  }, [filtered])

  const cumplidas = counts.completada
  const noShow = counts.noshow
  const canceladas = counts.cancelada
  const selfBooking = filtered.filter((a) => a.source === 'self').length
  const asistencia = cumplidas + noShow > 0 ? ((cumplidas / (cumplidas + noShow)) * 100).toFixed(2) : '0.00'

  const employees = useRrhhStore((s) => s.employees)
  const employeeName = (id) => {
    const rrhh = employees.find((e) => e.id === id)
    if (rrhh) return `${rrhh.firstName} ${rrhh.lastName}`
    return '—'
  }

  const attendedVsTotal = filtered.length > 0
    ? `${cumplidas} / ${filtered.length} (${((cumplidas / filtered.length) * 100).toFixed(2)}%)`
    : '0 / 0'

  const byEmployee = useMemo(() => {
    const map = {}
    filtered.filter((a) => a.employeeId && a.status === 'completada').forEach((a) => {
      const name = employeeName(a.employeeId)
      map[name] = (map[name] || 0) + 1
    })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [filtered, employees])

  const bySource = useMemo(() => {
    const staff = filtered.filter((a) => a.source !== 'self').length
    const self = filtered.filter((a) => a.source === 'self').length
    return [
      { id: 'staff', name: 'Equipo', value: staff, color: '#3b82f6' },
      { id: 'self', name: 'Auto-agendado', value: self, color: '#f59e0b' },
    ].filter((s) => s.value > 0)
  }, [filtered])

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

  const getAppointments = useCallback(() => appointments, [appointments])
  const fetcher = useCallback(
    (params) => fetchAgendaReport(getAppointments, { ...params, branchId, status, search, period }),
    [getAppointments, branchId, status, search, period]
  )
  const listReport = usePaginatedReport(fetcher, {}, 10, { key: 'date', dir: 'desc' })
  const branchOptions = [
    { value: '', label: 'Todas las sucursales' },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ]

  const handleBranchChange = (id) => {
    setBranchId(id)
    listReport.setPage(1)
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <ReportFilterBar
        branchId={branchId}
        onBranchChange={handleBranchChange}
        period={period}
        onPeriodChange={setPeriod}
        showPeriod
        periodOptions={AGENDA_REPORT_PERIODS}
        search={search}
        onSearchChange={(v) => { setSearch(v); listReport.setPage(1) }}
        searchPlaceholder="Buscar cliente o servicio…"
        status={status}
        onStatusChange={setStatus}
        statusOptions={STATUS_META.map((s) => ({ value: s.id, label: s.name }))}
        showBranch={false}
        onRefresh={listReport.reload}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Citas (período)" value={filtered.length} icon={CalendarClock} tone="brand" testId="report-stat-citas" />
        <StatCard label="Citas atendidas / total" value={attendedVsTotal} icon={CalendarCheck} tone="emerald" testId="report-stat-attended-ratio" />
        <StatCard label="No-show" value={noShow} icon={UserX} tone="red" testId="report-stat-noshow" />
        <StatCard label="Canceladas" value={canceladas} icon={Ban} tone="amber" testId="report-stat-canceladas" />
        <StatCard label="Auto-agendadas" value={selfBooking} icon={Globe} tone="violet" testId="report-stat-self" />
        <StatCard label="Tasa de asistencia" value={`${asistencia}%`} icon={Percent} tone="slate" sub="Cumplidas vs no-show" testId="report-stat-asistencia" />
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Citas cumplidas por empleado" subtitle="Top del período" testId="report-agenda-employee">
          {byEmployee.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin citas cumplidas en el período</p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height={280} minWidth={0}>
                <BarChart data={byEmployee} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="Origen de citas" subtitle="Equipo vs auto-agendado" testId="report-agenda-source">
          {bySource.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">Sin citas en el período</p>
          ) : (
            <>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height={200} minWidth={0}>
                  <PieChart>
                    <Pie data={bySource} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
                      {bySource.map((e) => <Cell key={e.id} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5">
                {bySource.map((e) => (
                  <li key={e.id} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} /> {e.name}</span>
                    <span className="font-semibold text-slate-800">{e.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="font-heading text-base font-semibold text-slate-800">Listado de citas</h3>
          <div className="w-full sm:w-56">
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Sucursal</label>
            <Select
              value={branchId || ''}
              onChange={handleBranchChange}
              options={branchOptions}
              data-testid="report-agenda-branch"
            />
          </div>
        </div>
        <ResponsiveList columnCount={9}>
          <ResponsiveTable testId="report-agenda-table" wrapCard={false}>
            <SortableTableProvider sortKey={listReport.sortKey} sortDir={listReport.sortDir} onSort={listReport.toggleSort}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <SortableTh column="date" className="whitespace-nowrap px-4 py-3">Fecha</SortableTh>
                  <SortableTh column="time" className="whitespace-nowrap px-4 py-3">Hora</SortableTh>
                  <SortableTh column="customerName" className="px-4 py-3">Cliente</SortableTh>
                  <SortableTh column="employeeName" className="px-4 py-3">Empleado</SortableTh>
                  <SortableTh column="serviceName" className="px-4 py-3">Servicio</SortableTh>
                  <SortableTh column="createdBy" className="px-4 py-3">Creado por</SortableTh>
                  <SortableTh column="updatedBy" className="px-4 py-3">Editado por</SortableTh>
                  <SortableTh column="status" className="px-4 py-3">Estado</SortableTh>
                  <th className="px-4 py-3 text-right">Auditoría</th>
                </tr>
              </thead>
              <tbody>
                {listReport.loading ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
                ) : listReport.items.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Sin citas</td></tr>
                ) : (
                  listReport.items.map((a) => {
                    const st = statusMeta(a.status)
                    const client = a.customerName || a.clientName
                    return (
                      <tr
                        key={a.id}
                        className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/80"
                        onClick={() => openEdit(a)}
                        data-testid={`report-agenda-row-${a.id}`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatCompactDate(a.date)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{a.time}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{client}</td>
                        <td className="px-4 py-3 text-slate-600">{employeeName(a.employeeId)}</td>
                        <td className="px-4 py-3 text-slate-600">{a.serviceName || a.service}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{a.createdBy || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{a.updatedBy || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge tone={st.tone}>{st.name}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openEdit(a) }}
                              title="Editar cita"
                              data-testid={`report-agenda-edit-${a.id}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setAuditId(a.id) }}
                              title="Ver auditoría"
                              data-testid={`report-agenda-audit-${a.id}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="report-agenda-cards" className="p-4">
            {!listReport.loading && listReport.items.map((a) => {
              const st = statusMeta(a.status)
              const client = a.customerName || a.clientName
              return (
                <MobileCard key={a.id} testId={`report-agenda-card-${a.id}`} onClick={() => openEdit(a)}>
                  <MobileCardHeader
                    title={client}
                    subtitle={`${formatCompactDate(a.date)} · ${a.time}`}
                    badge={<Badge tone={st.tone}>{st.name}</Badge>}
                    actions={
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEdit(a) }}
                          data-testid={`report-agenda-edit-${a.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setAuditId(a.id) }}
                          data-testid={`report-agenda-audit-${a.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    }
                  />
                  <MobileCardGrid>
                    <MobileField label="Empleado">{employeeName(a.employeeId)}</MobileField>
                    <MobileField label="Servicio">{a.serviceName || a.service}</MobileField>
                    <MobileField label="Creado por">{a.createdBy || '—'}</MobileField>
                    <MobileField label="Editado por" fullWidth>{a.updatedBy || '—'}</MobileField>
                  </MobileCardGrid>
                </MobileCard>
              )
            })}
          </ResponsiveCards>
        </ResponsiveList>
        <div className="px-5 pb-4">
          <Pagination
            page={listReport.page}
            totalPages={listReport.totalPages}
            total={listReport.total}
            from={listReport.from}
            to={listReport.to}
            pageSize={listReport.pageSize}
            onPageChange={listReport.setPage}
            onPageSizeChange={listReport.setPageSize}
            noun="citas"
          />
        </div>
      </div>

      <AppointmentAuditModal
        open={!!auditAppointment}
        onClose={() => setAuditId(null)}
        appointment={auditAppointment}
      />

      <AppointmentFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        appointment={editingAppointment}
        wide
      />
    </div>
  )
}
