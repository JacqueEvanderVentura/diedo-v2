import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { formatDOP } from '@/lib/format'
import { employeeName } from '../data/preview'
import { filterPreviewCommissions } from '../lib/navigation'
import { CarwashPanel, CarwashTable } from './CarwashPrimitives'

export function CommissionsPanel({ data, params, updateQuery, isDemo }) {
  const rows = filterPreviewCommissions(data.commissions, params)
  const washIds = new Set(rows.map((row) => row.washId))
  // Visual demo totals only. Connected aggregations arrive from the API in later phases.
  const totals = [
    ['Servicios completados', washIds.size],
    ['Monto facturado', formatDOP(data.washes.filter((wash) => washIds.has(wash.id)).reduce((sum, wash) => sum + Number(wash.total), 0))],
    ['Total comisiones calculadas', formatDOP(rows.reduce((sum, row) => sum + Number(row.amount), 0))],
    ['Comisiones pendientes', formatDOP(rows.filter((row) => row.status === 'pending').reduce((sum, row) => sum + Number(row.amount), 0))],
  ]
  const columns = [
    { key: 'date', label: 'Fecha', render: (row) => row.date },
    { key: 'employee', label: 'Empleado beneficiario', render: (row) => employeeName(row.employeeId) },
    { key: 'role', label: 'Rol en el lavado', render: (row) => <Badge tone={row.role === 'washer' ? 'brand' : 'neutral'}>{row.role === 'washer' ? 'Lavador' : 'Encargado'}</Badge> },
    { key: 'plate', label: 'Vehículo / Placa', render: (row) => row.plate },
    { key: 'service', label: 'Servicio realizado', render: (row) => row.service },
    { key: 'base', label: 'Base sin impuestos', render: (row) => formatDOP(row.base) },
    { key: 'rate', label: 'Comisión %', render: (row) => `${Number(row.rate)} %` },
    { key: 'amount', label: 'Comisión devengada', render: (row) => <strong className="font-medium text-blue-600">{formatDOP(row.amount)}</strong> },
    { key: 'state', label: 'Estado', render: (row) => <Badge tone={row.status === 'paid' ? 'success' : 'warning'}>{row.status === 'paid' ? 'Pagada' : 'Pendiente'}</Badge> },
  ]
  return (
    <CarwashPanel title="Cálculo de Comisiones del Personal" description="Consulta las comisiones por empleado y rol: lavador o encargado.">
      <div className="mb-6 grid gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div><p className="mb-2 text-xs font-medium text-slate-600">Empleado a consultar</p><Select data-testid="carwash-commission-employee" value={params.get('employeeId') || 'all'} onChange={(employeeId) => updateQuery({ employeeId })} options={[{ value: 'all', label: 'Todos los empleados' }, ...data.employees.map((item) => ({ value: item.id, label: item.name }))]} /></div>
        <div><p className="mb-2 text-xs font-medium text-slate-600">Estado de comisión</p><Select data-testid="carwash-commission-status" value={params.get('commissionStatus') || 'all'} onChange={(commissionStatus) => updateQuery({ commissionStatus })} options={[{ value: 'all', label: 'Todos los estados' }, { value: 'pending', label: 'Pendientes de pago' }, { value: 'paid', label: 'Pagadas' }]} /></div>
        <label className="min-w-0 text-xs font-medium text-slate-600">Fecha desde<Input className="mt-2" type="date" data-testid="carwash-date-from" value={params.get('dateFrom') || ''} onChange={(event) => updateQuery({ dateFrom: event.target.value })} /></label>
        <label className="min-w-0 text-xs font-medium text-slate-600">Fecha hasta<Input className="mt-2" type="date" data-testid="carwash-date-to" value={params.get('dateTo') || ''} onChange={(event) => updateQuery({ dateTo: event.target.value })} /></label>
      </div>
      {params.get('dateFrom') && params.get('dateTo') && params.get('dateFrom') > params.get('dateTo') && <p role="alert" className="mb-4 text-sm text-red-600">La fecha hasta debe ser igual o posterior a la fecha desde.</p>}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {totals.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className="mt-2 font-heading text-xl font-bold text-slate-900">{isDemo ? value : '—'}</p></div>)}
      </div>
      <CarwashTable columns={columns} rows={rows} testId="carwash-commissions" emptyMessage={isDemo ? 'No se encontraron registros de comisión bajo estos filtros.' : 'La consulta y liquidación de comisiones estarán disponibles próximamente.'} />
    </CarwashPanel>
  )
}
