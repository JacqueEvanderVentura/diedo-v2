import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DataSourceNotice } from '@/components/ui/DataSourceNotice'
import { carwashApi } from '../api'
import { currencyFormatter } from '../lib/settings'
import { useCarwashRead } from '../lib/useCarwashRead'
import { CarwashPanel, CarwashTable } from './CarwashPrimitives'
import { ServiceSettingsModal } from './ServiceSettingsModal'

export function ConnectedSettingsPanel({ branchId, workspace, params, updateQuery }) {
  const [modal, setModal] = useState(null)
  const [search, setSearch] = useState(params.get('serviceSearch') || '')
  const querySearch = params.get('serviceSearch') || ''
  const enabled = params.get('serviceEnabled') || 'all'
  const page = Math.max(1, Math.min(1000000, Math.trunc(Number(params.get('servicePage'))) || 1))
  const money = currencyFormatter(workspace)
  useEffect(() => { setSearch(querySearch) }, [querySearch])
  const load = useCallback(() => carwashApi.list({ branchId, search: querySearch || undefined, enabled: enabled === 'all' ? undefined : enabled === 'true', page, pageSize: 20 }), [branchId, querySearch, enabled, page])
  const { data, source, reload } = useCarwashRead(load, 0, !!branchId)
  useEffect(() => {
    if ([401, 403, 404].includes(source.error?.status)) setModal(null)
  }, [source.error])
  const ready = source.status === 'ready'
  const columns = [
    { key: 'name', label: 'Nombre del servicio', render: (row) => <div><strong>{row.name}</strong>{!row.available && <p className="mt-1 text-xs text-amber-700">{row.unavailableReason}</p>}</div> },
    { key: 'categoryName', label: 'Categoría', render: (row) => row.categoryName },
    { key: 'salePrice', label: 'Precio sin impuestos', render: (row) => <div><strong className="text-emerald-600">{money(row.salePrice)}</strong><p className="text-xs text-slate-500">Impuesto: <span className="whitespace-nowrap">{row.taxRate ?? '—'} %</span></p></div> },
    { key: 'washerRate', label: 'Comisión lavador (%)', render: (row) => <span className="text-blue-600">{Number(row.washerRate)} %</span> },
    { key: 'supervisorRate', label: 'Comisión encargado (%)', render: (row) => <span className="text-indigo-600">{Number(row.supervisorRate)} %</span> },
    { key: 'enabled', label: 'Estado', render: (row) => <Badge tone={row.enabled && row.available ? 'success' : 'neutral'}>{!row.enabled ? 'Deshabilitado' : row.available ? 'Habilitado' : 'No disponible'}</Badge> },
    { key: 'actions', label: 'Acciones', render: (row) => <Button variant="ghost" size="icon" disabled={!ready} aria-label={`Editar ${row.name}`} onClick={() => setModal({ service: row })}><Pencil className="h-4 w-4" aria-hidden /></Button> },
  ]
  if (!branchId) return null
  return <div className="space-y-4">
    <DataSourceNotice state={source} onRetry={reload} />
    <CarwashPanel title="Servicios de Lavado" description="Precios del catálogo y comisiones base para esta sucursal." action={<Button disabled={!ready} data-testid="carwash-new-service" onClick={() => setModal({})}><Plus className="h-4 w-4" aria-hidden />Nuevo Servicio</Button>}>
      <form className="mb-4 flex flex-wrap items-center gap-3" onSubmit={(event) => { event.preventDefault(); updateQuery({ serviceSearch: search.trim(), servicePage: null }) }}>
        <Input aria-label="Buscar servicios configurados" placeholder="Buscar servicio…" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} className="w-full sm:w-64" />
        <Button type="submit" variant="secondary">Buscar</Button>
        <Select aria-label="Estado de configuración" className="sm:w-48" value={enabled} options={[{ value: 'all', label: 'Todos los estados' }, { value: 'true', label: 'Habilitados' }, { value: 'false', label: 'Deshabilitados' }]} onChange={(value) => updateQuery({ serviceEnabled: value, servicePage: null })} />
        <Button type="button" variant="ghost" aria-label="Actualizar servicios" onClick={reload}><RefreshCw className="h-4 w-4" aria-hidden /></Button>
      </form>
      {source.status === 'stale' && <p className="mb-3 text-sm text-amber-800">Esta copia es de solo lectura hasta recuperar la conexión.</p>}
      <CarwashTable columns={columns} rows={data?.items || []} testId="carwash-services" emptyMessage={ready ? 'No hay servicios configurados con estos filtros. Usa Nuevo Servicio para habilitar servicios del catálogo o crearlos.' : 'Esperando una respuesta de la API.'} />
      {data && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><span>{data.totalItems} servicios · Página {data.page} de {Math.max(1, data.totalPages)}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={!ready || page <= 1} onClick={() => updateQuery({ servicePage: page - 1 })}>Anterior</Button><Button size="sm" variant="secondary" disabled={!ready || page >= data.totalPages} onClick={() => updateQuery({ servicePage: page + 1 })}>Siguiente</Button></div></div>}
    </CarwashPanel>
    {modal && <ServiceSettingsModal branchId={branchId} service={modal.service} money={money} writable={ready} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload() }} />}
  </div>
}
