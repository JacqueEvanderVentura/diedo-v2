import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { DataSourceNotice } from '@/components/ui/DataSourceNotice'
import { carwashApi } from '../api'
import { currencyFormatter } from '../lib/settings'
import { CarwashPanel, CarwashTable } from './CarwashPrimitives'
import { SettlementModal, commissionTotal } from './SettlementModal'

const STATES = { pending: ['Pendiente', 'warning'], settled: ['Pagada', 'success'], voided: ['Anulada', 'neutral'] }
const pageNumber = (value) => Math.max(1, Math.min(1000000, Math.trunc(Number(value)) || 1))

export function ConnectedCommissionsPanel({ branchId, workspace, onChanged, params, updateQuery }) {
  const [data, setData] = useState(null)
  const [context, setContext] = useState(null)
  const [history, setHistory] = useState(null)
  const [source, setSource] = useState({ status: 'loading' })
  const [selected, setSelected] = useState([])
  const [modal, setModal] = useState(null)
  const [revision, setRevision] = useState(0)
  const employeeId = params.get('employeeId') || ''
  const status = params.get('commissionStatus') === 'paid' ? 'settled' : params.get('commissionStatus') || ''
  const role = params.get('commissionRole') || ''
  const dateFrom = params.get('dateFrom') || ''
  const dateTo = params.get('dateTo') || ''
  const page = pageNumber(params.get('commissionPage'))
  const historyPage = pageNumber(params.get('settlementPage'))
  const invalidDates = dateFrom && dateTo && dateFrom > dateTo
  const ready = source.status === 'ready' && !invalidDates
  const money = currencyFormatter({ ...workspace, defaultCurrency: context?.currency || workspace?.defaultCurrency })
  const date = (value) => new Intl.DateTimeFormat(workspace?.locale || 'es', { dateStyle: 'short', timeStyle: 'short', timeZone: context?.timezone || 'UTC' }).format(new Date(value))
  const reload = () => setRevision((value) => value + 1)
  const filter = (changes) => { setSelected([]); updateQuery({ ...changes, commissionPage: null, settlementPage: null }) }
  useEffect(() => { setSelected([]) }, [branchId, employeeId, status, role, dateFrom, dateTo, page])
  useEffect(() => {
    if (!branchId || invalidDates) return
    let active = true
    let inFlight = false
    async function fetchData(background = false) {
      if (inFlight || (background && document.visibilityState === 'hidden')) return
      inFlight = true
      if (!background) setSource((previous) => ({ ...previous, status: 'loading' }))
      try {
        const [result, capabilities, settlements] = await Promise.all([carwashApi.commissions({ branchId, employeeId: employeeId || undefined, status: status || undefined, role: role || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, pageSize: 20 }), carwashApi.commissionContext(branchId), carwashApi.settlements({ branchId, employeeId: employeeId || undefined, page: historyPage, pageSize: 10 })])
        if (!active) return
        setData(result); setContext(capabilities); setHistory(settlements)
        setSelected((previous) => previous.filter((item) => result.items.some((row) => row.id === item.id && row.version === item.version && row.status === 'pending')))
        setSource({ status: 'ready', lastSyncedAt: new Date().toISOString() })
      } catch (failure) {
        if (!active) return
        const denied = [401, 403, 404].includes(failure.status)
        if (denied) { setData(null); setContext(null); setHistory(null); setModal(null); setSelected([]) }
        setSource((previous) => ({ ...previous, lastSyncedAt: denied ? undefined : previous.lastSyncedAt, status: denied || !previous.lastSyncedAt ? 'error' : 'stale', error: failure }))
      } finally { inFlight = false }
    }
    fetchData()
    const timer = setInterval(() => fetchData(true), 15000)
    const visible = () => { if (document.visibilityState === 'visible') fetchData(true) }
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [branchId, employeeId, status, role, dateFrom, dateTo, page, historyPage, revision, invalidDates])
  function toggle(row) { setSelected((previous) => previous.some((item) => item.id === row.id) ? previous.filter((item) => item.id !== row.id) : [...previous, row]) }
  function saved() { onChanged?.(); setSelected([]); setModal(null); reload() }
  const columns = [
    { key: 'select', label: 'Seleccionar', render: (row) => <input type="checkbox" aria-label={`Seleccionar ${row.service} ${row.role === 'washer' ? 'lavador' : 'encargado'} ${row.plate}`} checked={selected.some((item) => item.id === row.id)} disabled={!ready || !context?.canSettle || row.status !== 'pending' || (selected.length > 0 && row.employeeId !== selected[0].employeeId)} onChange={() => toggle(row)} className="h-4 w-4 accent-blue-600" /> },
    { key: 'date', label: 'Fecha', render: (row) => date(row.accruedAt) },
    { key: 'employee', label: 'Empleado beneficiario', render: (row) => row.employeeName },
    { key: 'role', label: 'Rol en el lavado', render: (row) => <Badge tone={row.role === 'washer' ? 'brand' : 'neutral'}>{row.role === 'washer' ? 'Lavador' : 'Encargado'}</Badge> },
    { key: 'plate', label: 'Vehículo / Placa', render: (row) => <>{row.plate}<span className="block text-xs text-slate-500">{row.saleNumber}</span></> },
    { key: 'service', label: 'Servicio realizado', render: (row) => row.service },
    { key: 'base', label: 'Base sin impuestos', render: (row) => money(row.baseAmount) },
    { key: 'rate', label: 'Comisión %', render: (row) => `${Number(row.rate)} %` },
    { key: 'amount', label: 'Comisión devengada', render: (row) => <strong className="font-medium text-blue-600">{money(row.amount)}</strong> },
    { key: 'state', label: 'Estado', render: (row) => <Badge tone={STATES[row.status]?.[1]}>{STATES[row.status]?.[0]}</Badge> },
  ]
  const totals = [['Lavados completados', data?.summary.washes ?? '—'], ['Monto facturado', data ? money(data.summary.billed) : '—'], ['Total comisiones calculadas', data ? money(data.summary.commissions) : '—'], ['Comisiones pendientes', data ? money(data.summary.pending) : '—']]
  const settlementColumns = [
    { key: 'date', label: 'Fecha de liquidación', render: (row) => date(row.createdAt) },
    { key: 'employee', label: 'Empleado', render: (row) => row.employeeName },
    { key: 'amount', label: 'Importe', render: (row) => money(row.amount) },
    { key: 'status', label: 'Estado', render: (row) => <Badge tone={row.status === 'posted' ? 'success' : 'neutral'}>{row.status === 'posted' ? 'Vigente' : 'Revertida'}</Badge> },
    { key: 'actions', label: 'Acciones', render: (row) => <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setModal({ type: 'detail', settlement: row })}>Detalle</Button>{row.status === 'posted' && context?.canReverse && <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={() => setModal({ type: 'reverse', settlement: row })}>Revertir</Button>}</div> },
  ]
  return <div className="space-y-5">
    <DataSourceNotice state={source} onRetry={reload} />
    {source.status === 'stale' && <p className="text-sm text-amber-800">Esta copia es de solo lectura hasta recuperar la conexión.</p>}
    <CarwashPanel title="Cálculo de Comisiones del Personal" description="Consulta las comisiones por empleado y rol: lavador o encargado.">
      <div className="mb-6 grid gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">Empleado a consultar<Select className="mt-2" data-testid="carwash-commission-employee" value={employeeId || 'all'} onChange={(value) => filter({ employeeId: value })} options={[{ value: 'all', label: 'Todos los empleados' }, ...(context?.employees || []).map((item) => ({ value: item.id, label: item.name }))]} /></label>
        <label className="text-xs font-medium text-slate-600">Estado de comisión<Select className="mt-2" data-testid="carwash-commission-status" value={status || 'all'} onChange={(value) => filter({ commissionStatus: value })} options={[{ value: 'all', label: 'Todos los estados' }, ...Object.entries(STATES).map(([value, state]) => ({ value, label: state[0] }))]} /></label>
        <label className="text-xs font-medium text-slate-600">Fecha desde<Input className="mt-2" type="date" value={dateFrom} onChange={(event) => filter({ dateFrom: event.target.value })} /></label>
        <label className="text-xs font-medium text-slate-600">Fecha hasta<Input className="mt-2" type="date" value={dateTo} onChange={(event) => filter({ dateTo: event.target.value })} /></label>
      </div>
      {invalidDates && <p role="alert" className="mb-4 text-sm text-red-700">La fecha hasta debe ser igual o posterior a la fecha desde.</p>}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{totals.map(([label, value], index) => <div key={label} className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-medium uppercase text-slate-500">{label}</p><p className={`mt-2 font-heading text-xl font-bold ${['text-slate-900', 'text-emerald-600', 'text-blue-600', 'text-amber-500'][index]}`}>{value}</p></div>)}</div>
      <div className="mb-4 flex flex-wrap items-center gap-3"><Select className="w-44" aria-label="Filtrar rol" value={role || 'all'} onChange={(value) => filter({ commissionRole: value })} options={[{ value: 'all', label: 'Ambos roles' }, { value: 'washer', label: 'Lavador' }, { value: 'supervisor', label: 'Encargado' }]} /><Button type="button" variant="ghost" onClick={reload}>Actualizar</Button><Button type="button" variant="ghost" onClick={() => filter({ employeeId: null, commissionStatus: null, commissionRole: null, dateFrom: null, dateTo: null })}>Limpiar filtros</Button></div>
      {context?.canSettle && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 p-3"><p className="text-sm text-blue-900">{selected.length ? `${selected[0].employeeName} · ${selected.length} comisiones · ${money(commissionTotal(selected))}` : 'Selecciona comisiones pendientes de un empleado.'}</p><Button type="button" disabled={!ready || !selected.length} data-testid="carwash-open-settlement" onClick={() => setModal({ type: 'settle', rows: [...selected] })}>Liquidar selección</Button></div>}
      <CarwashTable columns={columns} rows={data?.items || []} testId="carwash-commissions" emptyMessage={ready ? 'No se encontraron registros de comisión bajo estos filtros.' : 'Esperando una respuesta de la API.'} />
      <Pagination data={data} ready={ready} onPage={(value) => updateQuery({ commissionPage: value })} />
    </CarwashPanel>
    <CarwashPanel title="Historial de liquidaciones" description="Pagos y reversos del empleado seleccionado. Las fechas de devengo filtran únicamente las comisiones."><CarwashTable columns={settlementColumns} rows={history?.items || []} testId="carwash-settlements" emptyMessage="No hay liquidaciones registradas." /><Pagination data={history} ready={ready} onPage={(value) => updateQuery({ settlementPage: value })} /></CarwashPanel>
    {['settle', 'reverse'].includes(modal?.type) && <SettlementModal branchId={branchId} rows={modal.rows} settlement={modal.settlement} money={money} writable={ready} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.type === 'detail' && <Modal open title="Detalle de liquidación" testId="carwash-settlement-detail" onClose={() => setModal(null)}><div className="space-y-4 text-sm"><p><strong>{modal.settlement.employeeName}</strong> · {money(modal.settlement.amount)}</p><p>{date(modal.settlement.createdAt)} · {modal.settlement.status === 'posted' ? 'Vigente' : 'Revertida'}</p><p className="break-all text-xs text-slate-500">Caja: {modal.settlement.registerId}<br />Egreso: {modal.settlement.movementId || 'Sin movimiento (importe cero)'}</p><ul className="space-y-2">{modal.settlement.commissions.map((row) => <li key={row.id} className="rounded-lg bg-slate-50 p-3">{row.service} · {row.role === 'washer' ? 'Lavador' : 'Encargado'} · {row.plate}<strong className="block">{money(row.amount)}</strong></li>)}</ul>{modal.settlement.reversedAt && <p>Revertida el {date(modal.settlement.reversedAt)}: {modal.settlement.reversalReason}</p>}<Button type="button" onClick={() => setModal(null)}>Cerrar</Button></div></Modal>}
  </div>
}

function Pagination({ data, ready, onPage }) {
  if (!data) return null
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><span>{data.totalItems} registros · Página {data.page} de {Math.max(1, data.totalPages)}</span><div className="flex gap-2"><Button type="button" size="sm" variant="secondary" disabled={!ready || data.page <= 1} onClick={() => onPage(data.page - 1)}>Anterior</Button><Button type="button" size="sm" variant="secondary" disabled={!ready || data.page >= data.totalPages} onClick={() => onPage(data.page + 1)}>Siguiente</Button></div></div>
}
