import { RotateCcw, Search } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDOP } from '@/lib/format'
import { employeeName } from '../data/preview'
import { WASH_STATES, filterPreviewWashes } from '../lib/navigation'
import { CarwashPanel, CarwashTable } from './CarwashPrimitives'

export function OperationsPanel({ data, params, updateQuery, isDemo }) {
  const columns = [
    { key: 'date', label: 'Fecha / Hora', render: (row) => <><span className="whitespace-nowrap">{row.date}</span><span className="block text-xs text-slate-500">{row.time}</span></> },
    { key: 'vehicle', label: 'Cliente & Vehículo', render: (row) => <><strong className="font-medium">{row.customer}</strong><span className="block text-xs text-slate-500">{row.plate} · {row.vehicle}</span></> },
    { key: 'service', label: 'Servicio', render: (row) => row.service },
    { key: 'washer', label: 'Lavador asignado', render: (row) => employeeName(row.washerId) },
    { key: 'supervisor', label: 'Encargado supervisor', render: (row) => employeeName(row.supervisorId) },
    { key: 'total', label: 'Precio / Pago', render: (row) => <><strong className="font-medium">{formatDOP(row.total)}</strong><span className="block text-xs text-slate-500">{row.payment}</span></> },
    { key: 'status', label: 'Estado', render: (row) => <Badge tone={WASH_STATES[row.status].tone}>{WASH_STATES[row.status].label}</Badge> },
    { key: 'actions', label: 'Flujo operativo / Acciones', render: () => <span className="text-xs text-slate-500">Vista previa · Solo lectura</span> },
  ]
  return (
    <CarwashPanel title="Listado de Lavados Activos" description="Visualiza el estado de los vehículos, sus servicios y el personal responsable.">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1 lg:max-w-sm">
          <Input icon={Search} aria-label="Buscar lavados" data-testid="carwash-search" placeholder="Buscar por placa, cliente o servicio…" value={params.get('search') || ''} onChange={(event) => updateQuery({ search: event.target.value }, true)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] lg:ml-auto">
          <Select size="sm" className="sm:min-w-44" data-testid="carwash-status-filter" value={params.get('washStatus') || 'all'} onChange={(washStatus) => updateQuery({ washStatus })} options={[{ value: 'all', label: 'Todos los estados' }, ...Object.entries(WASH_STATES).map(([value, state]) => ({ value, label: state.label }))]} />
          <Select size="sm" className="sm:min-w-48" data-testid="carwash-employee-filter" value={params.get('employeeId') || 'all'} onChange={(employeeId) => updateQuery({ employeeId })} options={[{ value: 'all', label: 'Todos los empleados' }, ...data.employees.map((item) => ({ value: item.id, label: item.name }))]} />
          <Button variant="ghost" data-testid="carwash-clear-filters" onClick={() => updateQuery({ search: null, washStatus: null, employeeId: null })}><RotateCcw className="h-4 w-4" aria-hidden />Limpiar</Button>
        </div>
      </div>
      <CarwashTable columns={columns} rows={filterPreviewWashes(data.washes, params)} testId="carwash-washes" emptyMessage={isDemo ? 'No se encontraron servicios de lavado bajo estos filtros.' : 'La consulta de lavados estará disponible próximamente.'} />
    </CarwashPanel>
  )
}
