import { Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDOP } from '@/lib/format'
import { CarwashPanel, CarwashTable } from './CarwashPrimitives'

export function SettingsPanel({ services, isDemo, onPreview }) {
  const columns = [
    { key: 'name', label: 'Nombre del servicio', render: (row) => <strong className="font-semibold">{row.name}</strong> },
    { key: 'category', label: 'Categoría', render: (row) => row.category },
    { key: 'price', label: 'Precio de venta', render: (row) => <span className="font-semibold text-emerald-600">{formatDOP(row.price)}</span> },
    { key: 'washerRate', label: 'Comisión lavador (%)', render: (row) => <span className="text-blue-600">{Number(row.washerRate)} %</span> },
    { key: 'supervisorRate', label: 'Comisión encargado (%)', render: (row) => <span className="text-indigo-600">{Number(row.supervisorRate)} %</span> },
    { key: 'active', label: 'Estado', render: (row) => <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Activo' : 'Inactivo'}</Badge> },
    { key: 'actions', label: 'Acciones', render: (row) => <Button variant="ghost" size="icon" aria-label={`Ver precio y comisiones de ${row.name}`} title="Vista previa de edición" data-testid={`carwash-preview-service-${row.id}`} onClick={() => onPreview({ type: 'service', service: row })}><Pencil className="h-4 w-4" aria-hidden /></Button> },
  ]
  return (
    <CarwashPanel title="Servicios de Lavado Activos" description="Tipos de lavado y comisiones base del lavador y del encargado." action={<Button disabled={!isDemo} title={isDemo ? 'Vista previa del formulario' : 'Configuración de servicios próximamente'} data-testid="carwash-new-service" onClick={() => onPreview({ type: 'service' })}><Plus className="h-4 w-4" aria-hidden />Nuevo Servicio</Button>}>
      <CarwashTable columns={columns} rows={services} testId="carwash-services" emptyMessage={isDemo ? 'No hay servicios de lavado configurados en este escenario.' : 'La configuración de servicios estará disponible próximamente.'} />
    </CarwashPanel>
  )
}
