import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { DataSourceNotice } from '@/components/ui/DataSourceNotice'
import { carwashApi } from '../api'
import { WASH_STATES } from '../lib/navigation'
import { currencyFormatter } from '../lib/settings'
import { CarwashPanel, CarwashTable } from './CarwashPrimitives'
import { WashLookup } from './WashLookup'
import { WashFormModal } from './WashFormModal'
import { WashCheckoutModal } from './WashCheckoutModal'
import { WashBilling } from './WashBilling'
import { WashActionModal } from './WashActionModal'

export function ConnectedOperationsPanel({ branchId, workspace, onChanged, params, updateQuery, scopeKey, openRequest, onAvailability }) {
  const [data, setData] = useState(null)
  const [context, setContext] = useState(null)
  const [source, setSource] = useState({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [modal, setModal] = useState(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState(params.get('search') || '')
  const [employeeName, setEmployeeName] = useState('')
  const request = useRef(openRequest)
  const mounted = useRef(true)
  const query = params.get('search') || ''
  const status = Object.keys(WASH_STATES).includes(params.get('washStatus')) ? params.get('washStatus') : 'all'
  const employeeId = params.get('employeeId') || ''
  const page = Math.max(1, Math.min(1000000, Math.trunc(Number(params.get('washPage'))) || 1))
  const money = currencyFormatter({ ...workspace, defaultCurrency: modal?.wash?.currency || workspace?.defaultCurrency })
  const ready = source.status === 'ready'
  const writable = ready && !!context?.canManage
  const reload = () => setRevision((value) => value + 1)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setSearch(query) }, [query])
  useEffect(() => { onAvailability({ scopeKey, writable }) }, [scopeKey, writable, onAvailability])
  useEffect(() => {
    if (openRequest === request.current) return
    request.current = openRequest
    if (writable) setModal({ type: 'form' })
  }, [openRequest, writable])
  useEffect(() => {
    if (!branchId) return
    let active = true
    let inFlight = false
    async function fetchData(background = false) {
      if (inFlight || (background && document.visibilityState === 'hidden')) return
      inFlight = true
      if (!background) setSource((previous) => ({ ...previous, status: 'loading' }))
      try {
        const [result, capabilities] = await Promise.all([carwashApi.washes({ branchId, search: query || undefined, status: status === 'all' ? undefined : status, employeeId: employeeId || undefined, page, pageSize: 20 }), carwashApi.operationContext(branchId)])
        if (!active) return
        setData(result); setContext(capabilities); setSource({ status: 'ready', lastSyncedAt: new Date().toISOString() })
      } catch (failure) {
        if (!active) return
        const denied = [401, 403, 404].includes(failure.status)
        if (denied) { setData(null); setContext(null); setModal(null) }
        setSource((previous) => ({ ...previous, lastSyncedAt: denied ? undefined : previous.lastSyncedAt, status: denied || !previous.lastSyncedAt ? 'error' : 'stale', error: failure }))
      } finally { inFlight = false }
    }
    fetchData()
    const timer = setInterval(() => fetchData(true), 15000)
    const visible = () => { if (document.visibilityState === 'visible') fetchData(true) }
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [branchId, query, status, employeeId, page, revision])
  async function open(wash, type) {
    if (opening || !ready) return
    setOpening(true); setError(null)
    try {
      const latest = await carwashApi.wash(wash.id)
      if (!mounted.current) return
      if ((['form', 'start', 'cancel'].includes(type) && !['waiting', 'washing'].includes(latest.status)) || (type === 'complete' && latest.status !== 'washing') || (type === 'void' && latest.status !== 'completed')) { reload(); setError(new Error('El lavado cambió y ya no permite esta acción.')); return }
      setModal({ type, wash: latest })
    } catch (failure) { if (mounted.current) setError(failure) }
    finally { if (mounted.current) setOpening(false) }
  }
  function saved() { onChanged?.(); setModal(null); reload() }
  const columns = [
    { key: 'date', label: 'Fecha / Hora', render: (row) => <span>{new Intl.DateTimeFormat(workspace?.locale || 'es', { dateStyle: 'short', timeStyle: 'short', timeZone: row.timezone }).format(new Date(row.createdAt))}</span> },
    { key: 'customer', label: 'Cliente & Vehículo', render: (row) => <><strong className="font-medium">{row.customerName}</strong><span className="block text-xs text-slate-500">{row.plate} · {[row.vehicleModel, row.vehicleColor].filter(Boolean).join(' · ') || 'Sin datos adicionales'}</span></> },
    { key: 'services', label: 'Servicios', render: (row) => <ul className="space-y-1">{row.lines.map((line) => <li key={line.id}>{line.name}</li>)}</ul> },
    { key: 'washer', label: 'Lavador asignado', render: (row) => row.washerName },
    { key: 'supervisor', label: 'Encargado supervisor', render: (row) => row.supervisorName },
    { key: 'total', label: 'Precio / Pago', render: (row) => <><strong>{currencyFormatter({ ...workspace, defaultCurrency: row.currency })(row.finalTotal ?? row.total)}</strong><p className="text-xs text-slate-500">{row.saleId ? `${row.saleNumber} · ${row.status === 'voided' ? 'Anulado' : row.receivableId ? 'Pago en CxC' : 'Cobrado'}` : `Previsto: ${row.paymentMethodName || 'Sin definir'} · Sin cobrar`}</p></> },
    { key: 'status', label: 'Estado', render: (row) => <Badge tone={WASH_STATES[row.status]?.tone}>{WASH_STATES[row.status]?.label || row.status}</Badge> },
    { key: 'actions', label: 'Flujo operativo / Acciones', render: (row) => <div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" disabled={!ready || opening} onClick={() => open(row, 'detail')}>Ver detalle</Button>{context?.canManage && ['waiting', 'washing'].includes(row.status) && <><Button size="sm" variant="ghost" disabled={!writable || opening} onClick={() => open(row, 'form')}>Editar</Button>{row.status === 'waiting' && <Button size="sm" variant="secondary" disabled={!writable || opening} onClick={() => open(row, 'start')}>Iniciar</Button>}<Button size="sm" variant="ghost" disabled={!writable || opening} onClick={() => open(row, 'cancel')}>Cancelar</Button></>}{['waiting', 'washing'].includes(row.status) && <Button size="sm" variant="secondary" disabled={!ready || opening || !context?.canComplete || row.status !== 'washing'} title={row.status === 'waiting' ? 'Inicia el lavado antes de completarlo' : undefined} onClick={() => open(row, 'complete')}>Completar</Button>}{context?.canVoid && row.status === 'completed' && <Button size="sm" variant="ghost" disabled={!ready || opening} onClick={() => open(row, 'void')}>Anular</Button>}</div> },
  ]
  if (!branchId) return null
  return <div className="space-y-4">
    <DataSourceNotice state={source} onRetry={reload} />
    <CarwashPanel title="Listado de Lavados Activos" description="Recepción, responsables y seguimiento de los vehículos de esta sucursal.">
      <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); updateQuery({ search: search.trim(), washPage: null }) }}><div className="min-w-0 flex-1"><Input aria-label="Buscar lavados" data-testid="carwash-search" placeholder="Buscar por placa, cliente o servicio…" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></div><Button type="submit" variant="secondary">Buscar</Button><Select aria-label="Estado del lavado" data-testid="carwash-status-filter" className="w-full sm:w-52" value={status} onChange={(value) => updateQuery({ washStatus: value, washPage: null })} options={[{ value: 'all', label: 'Todos los estados' }, ...Object.entries(WASH_STATES).map(([value, state]) => ({ value, label: state.label }))]} /><Button type="button" variant="ghost" aria-label="Actualizar lavados" onClick={reload}><RefreshCw className="h-4 w-4" /></Button><Button type="button" variant="ghost" data-testid="carwash-clear-filters" onClick={() => updateQuery({ search: null, washStatus: null, employeeId: null, washPage: null })}>Limpiar</Button></form>
      <details className="mb-4 rounded-lg border border-slate-200 p-3" open={employeeId ? true : undefined}><summary className="cursor-pointer text-sm font-medium text-slate-600">Filtrar por empleado{employeeId ? `: ${employeeName || 'seleccionado'}` : ''}</summary><div className="mt-3 max-w-sm"><WashLookup branchId={branchId} kind="employees" label="Empleado" value={employeeId} selectedName={employeeName} optional onChange={(item) => { setEmployeeName(item?.name || ''); updateQuery({ employeeId: item?.id, washPage: null }) }} /></div></details>
      {source.status === 'stale' && <p className="mb-3 text-sm text-amber-800">Esta copia es de solo lectura hasta recuperar la conexión.</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error.message}</p>}
      <CarwashTable columns={columns} rows={data?.items || []} testId="carwash-washes" emptyMessage={ready ? 'No se encontraron lavados con estos filtros. Registra un vehículo para comenzar.' : 'Esperando una respuesta de la API.'} />
      {data && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><span>{data.totalItems} lavados · Página {data.page} de {Math.max(1, data.totalPages)}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={!ready || page <= 1} onClick={() => updateQuery({ washPage: page - 1 })}>Anterior</Button><Button size="sm" variant="secondary" disabled={!ready || page >= data.totalPages} onClick={() => updateQuery({ washPage: page + 1 })}>Siguiente</Button></div></div>}
    </CarwashPanel>
    {modal?.type === 'form' && <WashFormModal branchId={branchId} wash={modal.wash} context={context} writable={writable} money={money} onClose={() => setModal(null)} onSaved={saved} />}
    {['start', 'cancel', 'void'].includes(modal?.type) && <WashActionModal wash={modal.wash} action={modal.type} writable={ready && (modal.type === 'void' ? context?.canVoid : context?.canManage)} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.type === 'complete' && <WashCheckoutModal wash={modal.wash} writable={ready && !!context?.canComplete} money={currencyFormatter({ ...workspace, defaultCurrency: modal.wash.currency })} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.type === 'detail' && <Modal open wide title={`Lavado ${modal.wash.plate}`} onClose={() => setModal(null)} testId="carwash-wash-detail"><div className="space-y-4 text-sm"><p><strong>{modal.wash.customerName}</strong> · {WASH_STATES[modal.wash.status].label}</p><p>{[modal.wash.vehicleModel, modal.wash.vehicleColor].filter(Boolean).join(' · ')}</p><p>Lavador: {modal.wash.washerName}<br />Encargado: {modal.wash.supervisorName}</p><ul className="space-y-2">{modal.wash.lines.map((line) => <li key={line.id} className="rounded-lg bg-slate-50 p-3"><strong>{line.name}</strong><p>{money(line.unitPrice)} + {money(line.taxAmount)} impuestos = {money(line.total)}</p></li>)}</ul><p className="font-semibold">Total registrado: {money(modal.wash.total)}{!modal.wash.saleId && ' · Sin cobrar'}</p><p>{modal.wash.saleId ? 'Método confirmado' : 'Pago previsto'}: {modal.wash.paymentMethodName || 'Sin definir'}</p>{modal.wash.saleId && <WashBilling wash={modal.wash} money={currencyFormatter({ ...workspace, defaultCurrency: modal.wash.currency })} writable={ready} />}{modal.wash.voidReason && <p className="rounded-lg bg-amber-50 p-3">Motivo de anulación: {modal.wash.voidReason}</p>}{modal.wash.cancelReason && <p className="rounded-lg bg-amber-50 p-3">Motivo de cancelación: {modal.wash.cancelReason}</p>}<Button onClick={() => setModal(null)}>Cerrar</Button></div></Modal>}
  </div>
}
