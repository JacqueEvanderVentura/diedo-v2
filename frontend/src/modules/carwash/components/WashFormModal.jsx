import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { CustomerFormModal } from '@/modules/crm/components/CustomerFormModal'
import { carwashApi } from '../api'
import { WashLookup } from './WashLookup'
import { SetupLink } from './SetupLink'

const fieldsFrom = (wash) => ({ customerId: wash?.customerId || '', customerName: wash?.customerName || '', plate: wash?.plate || '', vehicleModel: wash?.vehicleModel || '', vehicleColor: wash?.vehicleColor || '', washerId: wash?.washerId || '', washerName: wash?.washerName || '', supervisorId: wash?.supervisorId || '', supervisorName: wash?.supervisorName || '', paymentMethodId: wash?.paymentMethodId || '', paymentMethodName: wash?.paymentMethodName || '' })
const linesFrom = (wash) => wash?.lines.map((line) => ({ ...line, id: line.serviceConfigId, salePrice: line.unitPrice })) || []

export function WashFormModal({ branchId, wash, context, writable, money, onClose, onSaved }) {
  const [current, setCurrent] = useState(wash)
  const [form, setForm] = useState(() => fieldsFrom(wash))
  const [services, setServices] = useState(() => linesFrom(wash))
  const [quickCustomer, setQuickCustomer] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef(false)
  const attempt = useRef(null)
  const mounted = useRef(true)
  const defaults = useMemo(() => ({ branchIds: [branchId] }), [branchId])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const locked = busy || uncertain || !writable
  const set = (key, value) => { setForm((previous) => ({ ...previous, [key]: value })); setError(null) }
  const select = (role, option) => setForm((previous) => ({ ...previous, [`${role}Id`]: option?.id || '', [`${role}Name`]: option?.name || '' }))
  async function reload() {
    if (pending.current) return
    pending.current = true; setBusy(true)
    try {
      const latest = await carwashApi.wash(current.id)
      if (!mounted.current) return
      if (!['waiting', 'washing'].includes(latest.status)) { onSaved(); return }
      setCurrent(latest); setForm(fieldsFrom(latest)); setServices(linesFrom(latest)); setError(null); setUncertain(false); attempt.current = null
    } catch (failure) { if (mounted.current) setError(failure) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  async function save(event) {
    event.preventDefault()
    if (pending.current || !writable) return
    if (!form.customerId || !form.plate.trim() || !form.washerId || !form.supervisorId || !services.length) { setError(new Error('Selecciona cliente, placa, servicios, lavador y encargado.')); return }
    const payload = { customerId: form.customerId, plate: form.plate.trim(), vehicleModel: form.vehicleModel.trim() || null, vehicleColor: form.vehicleColor.trim() || null, serviceIds: services.map((item) => item.id), washerId: form.washerId, supervisorId: form.supervisorId, paymentMethodId: form.paymentMethodId || null, ...(current ? { version: current.version } : { branchId }) }
    if (!attempt.current) attempt.current = { payload, key: crypto.randomUUID() }
    pending.current = true; setBusy(true); setError(null)
    try {
      const result = current ? await carwashApi.updateWash(current.id, attempt.current.payload) : await carwashApi.createWash(attempt.current.payload, attempt.current.key)
      if (mounted.current) onSaved(result)
    } catch (failure) {
      if (!mounted.current) return
      setError(failure)
      const ambiguous = !failure.status || failure.status >= 500
      setUncertain(ambiguous || (!!current && failure.status === 409))
      if (!ambiguous) attempt.current = null
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  if (quickCustomer) return <CustomerFormModal open defaults={defaults} onClose={() => setQuickCustomer(false)} onCreated={(customer) => select('customer', { id: customer.id, name: customer.name || customer.displayName })} />
  return <Modal open wide title={current ? 'Editar lavado' : 'Registrar lavado'} testId="carwash-wash-modal" onClose={() => { if (!pending.current && !uncertain) onClose() }} bodyClassName="flex flex-col overflow-hidden p-0">
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 space-y-5 overflow-y-auto p-5" data-testid="carwash-wash-fields">
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Recepción de vehículo · Este registro no genera ventas ni cobros.</p>
        <WashLookup branchId={branchId} kind="customers" label="Cliente" value={form.customerId} selectedName={form.customerName} onChange={(option) => select('customer', option)} disabled={locked} />
        {context.canCreateCustomer && <Button type="button" variant="secondary" size="sm" disabled={locked} onClick={() => setQuickCustomer(true)}>Crear cliente rápido</Button>}
        <div className="grid gap-4 sm:grid-cols-3">
          {[['plate', 'Placa', 32], ['vehicleModel', 'Marca / modelo', 120], ['vehicleColor', 'Color', 60]].map(([key, label, max]) => <label key={key} className="block text-xs font-semibold text-slate-700">{label}<Input className="mt-2" value={form[key]} maxLength={max} required={key === 'plate'} disabled={locked} onChange={(event) => set(key, event.target.value)} /></label>)}
        </div>
        <WashLookup branchId={branchId} kind="services" label="Añadir servicio" value="" onChange={(item) => { if (item && !services.some((row) => row.id === item.id)) setServices((rows) => [...rows, item]) }} disabled={locked || services.length >= 20} />
        {context.canConfigureServices && <SetupLink href={`/carwash?tab=configuracion&branchId=${branchId}`}>Configurar o crear servicios</SetupLink>}
        <ul className="space-y-2" aria-label="Servicios seleccionados">{services.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm"><div className="min-w-0"><strong className="break-words">{item.name}</strong><p className="text-xs text-slate-500">{money(item.salePrice)} + {item.taxRate}% impuesto{item.serviceConfigId ? ' · Precio conservado' : ''}</p></div><Button type="button" size="sm" variant="ghost" disabled={locked} aria-label={`Quitar ${item.name}`} onClick={() => setServices((rows) => rows.filter((row) => row.id !== item.id))}>Quitar</Button></li>)}</ul>
        <div className="grid gap-4 sm:grid-cols-2"><WashLookup branchId={branchId} kind="employees" label="Lavador" value={form.washerId} selectedName={form.washerName} onChange={(item) => select('washer', item)} disabled={locked} /><WashLookup branchId={branchId} kind="employees" label="Encargado" value={form.supervisorId} selectedName={form.supervisorName} onChange={(item) => select('supervisor', item)} disabled={locked} /></div>
        {context.canManageEmployees && <SetupLink href="/rrhh/directorio">Gestionar empleados y sucursales</SetupLink>}
        <WashLookup branchId={branchId} kind="paymentMethods" label="Método de pago previsto" optional value={form.paymentMethodId} selectedName={form.paymentMethodName} onChange={(item) => select('paymentMethod', item)} disabled={locked} />
        <p className="text-xs text-slate-500">El mismo empleado puede ocupar ambos roles. El importe final lo calcula el servidor; la forma de pago se confirmará al finalizar.</p>
      </div>
      <div className="shrink-0 space-y-3 border-t bg-white p-4">
        {!writable && <p role="alert" className="text-sm text-amber-800">Solo lectura hasta recuperar la conexión.</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error.message}</p>}
        {uncertain && <p className="text-xs text-amber-800">No se confirmó el resultado. Reintenta la misma solicitud{current ? ' o recarga el lavado para revisar su estado' : ' para recuperar el registro sin duplicarlo'}.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {current && (uncertain || error?.status === 409) && <Button type="button" variant="secondary" disabled={busy} onClick={reload}>Recargar lavado</Button>}
          <Button type="button" variant="secondary" disabled={busy || uncertain} onClick={onClose}>Cerrar</Button>
          <Button type="submit" disabled={busy || !writable || error?.status === 409} data-testid="carwash-save-wash">{busy ? 'Guardando…' : uncertain ? 'Reintentar registro' : current ? 'Guardar cambios' : 'Registrar lavado'}</Button>
        </div>
      </div>
    </form>
  </Modal>
}
