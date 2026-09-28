import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { carwashApi } from '../api'
import { buildServiceBatch, validateRates } from '../lib/settings'
import { SetupLink } from './SetupLink'

const newLine = () => ({ key: crypto.randomUUID(), name: '', categoryId: '', unitOfMeasureId: '', salePrice: '', taxRate: '18', washerRate: '20', supervisorRate: '5' })

function Field({ label, ...props }) {
  return <label className="block min-w-0 text-xs font-semibold text-slate-700">{label}<Input className="mt-2" {...props} /></label>
}

function Rates({ line, onChange, disabled }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <Field label="Comisión lavador (%)" inputMode="decimal" value={line.washerRate} disabled={disabled} onChange={(event) => onChange({ washerRate: event.target.value })} />
    <Field label="Comisión encargado (%)" inputMode="decimal" value={line.supervisorRate} disabled={disabled} onChange={(event) => onChange({ supervisorRate: event.target.value })} />
  </div>
}

export function ServiceSettingsModal({ branchId, service, money, writable = true, onClose, onSaved }) {
  const [current, setCurrent] = useState(service)
  const [edit, setEdit] = useState(service || {})
  const [mode, setMode] = useState('existing')
  const [lines, setLines] = useState(() => [newLine()])
  const [selected, setSelected] = useState([])
  const [options, setOptions] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const attempt = useRef(null)
  const saving = useRef(false)
  const content = useRef(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const previous = document.activeElement
    const dialog = content.current?.closest('[role="dialog"]')
    const elements = () => [...(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]') || [])]
    elements()[0]?.focus()
    const trap = (event) => {
      if (event.key !== 'Tab') return
      const list = elements()
      if (event.shiftKey && document.activeElement === list[0]) { event.preventDefault(); list.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === list.at(-1)) { event.preventDefault(); list[0]?.focus() }
    }
    dialog?.addEventListener('keydown', trap)
    return () => { mounted.current = false; dialog?.removeEventListener('keydown', trap); previous?.focus?.() }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    Promise.all([carwashApi.formOptions(branchId), service ? Promise.resolve(null) : carwashApi.options({ branchId, search: query || undefined, page, pageSize: 10 })])
      .then(([form, available]) => {
        if (!active) return
        setOptions(form)
        setCatalog(available)
        setLines((rows) => rows.map((row) => ({ ...row, unitOfMeasureId: row.unitOfMeasureId || form.units.find((unit) => unit.code === 'unit')?.id || form.units[0]?.id || '' })))
      }).catch((failure) => { if (active) setLoadError(failure) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [branchId, query, page, revision, service])

  async function reloadEdit() {
    setBusy(true)
    try {
      const latest = await carwashApi.get(current.id)
      if (!mounted.current) return
      setCurrent(latest); setEdit(latest); setError(null); setUncertain(false); attempt.current = null
    } catch (failure) { if (mounted.current) setError(failure) }
    finally { if (mounted.current) setBusy(false) }
  }

  async function save() {
    if (!writable || saving.current || loading || loadError) return
    let payload
    try {
      if (current) {
        const validation = validateRates(edit)
        if (validation) throw new Error(validation)
        payload = { version: current.version, enabled: edit.enabled, washerRate: edit.washerRate, supervisorRate: edit.supervisorRate }
      } else payload = buildServiceBatch(branchId, mode === 'existing' ? selected : lines, mode)
    } catch (failure) { setError(failure); return }
    // Preserve the exact payload/key after an ambiguous network failure.
    if (!attempt.current || (!uncertain && JSON.stringify(payload) !== JSON.stringify(attempt.current.payload))) attempt.current = { payload, key: crypto.randomUUID() }
    saving.current = true; setBusy(true); setError(null)
    try {
      if (current) await carwashApi.update(current.id, attempt.current.payload)
      else await carwashApi.create(attempt.current.payload, attempt.current.key)
      if (mounted.current) onSaved()
    } catch (failure) {
      if (!mounted.current) return
      setError(failure)
      setUncertain(!failure.status || failure.status >= 500)
    } finally { saving.current = false; if (mounted.current) setBusy(false) }
  }

  const locked = !writable || busy || uncertain
  const changeLine = (index, changes) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, ...changes } : row))
  const switchMode = (value) => { setMode(value); setError(null) }
  return <Modal open wide title={current ? 'Editar Servicio / Lavado' : 'Agregar Tipos de Servicio / Lavado'} testId="carwash-service-modal" onClose={() => { if (!saving.current && !busy && !uncertain) onClose() }} bodyClassName="p-0 sm:p-0">
    <div ref={content} className="flex max-h-[70dvh] min-h-0 flex-col">
      <div className="min-h-0 space-y-5 overflow-y-auto p-5" data-testid="carwash-service-fields">
        <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">Las comisiones se aplicarán al importe sin impuestos y después de descuentos. Los cambios de configuración no recalculan lavados anteriores.</p>
        {(loading || loadError) && <div role="status" className="text-sm text-slate-600">{loading ? 'Cargando catálogo y configuración…' : <><p>{loadError.message}</p><Button size="sm" variant="secondary" onClick={() => setRevision((value) => value + 1)}>Reintentar carga</Button></>}</div>}
        {current ? <>
          <div><h3 className="font-semibold">{current.name}</h3><p className="mt-1 text-sm text-slate-500">{current.categoryName} · {money(current.salePrice)} sin impuestos · Impuesto {current.taxRate ?? '—'} %</p></div>
          <Rates line={edit} onChange={(changes) => setEdit({ ...edit, ...changes })} disabled={locked} />
          <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={edit.enabled} disabled={locked || (!current.available && !edit.enabled)} onChange={(event) => setEdit({ ...edit, enabled: event.target.checked })} />Habilitado en esta sucursal</label>
          {!current.available && <p className="text-sm text-amber-800">{current.unavailableReason}</p>}
          <p className="text-sm text-slate-500">Nombre, precio e impuestos se administran en <SetupLink href="/inventarios?tab=productos">Inventarios</SetupLink>. El formulario permanece abierto.</p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={reloadEdit}>Recargar valores actuales</Button>
        </> : <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Origen de los servicios">
            <Button size="sm" aria-pressed={mode === 'existing'} variant={mode === 'existing' ? 'primary' : 'secondary'} disabled={locked} onClick={() => switchMode('existing')}>Del catálogo</Button>
            <Button size="sm" aria-pressed={mode === 'new'} variant={mode === 'new' ? 'primary' : 'secondary'} disabled={locked || !options?.canCreateServices} title={!options?.canCreateServices ? 'Necesitas permiso para gestionar Inventarios en esta sucursal' : undefined} onClick={() => switchMode('new')}>Crear servicios</Button>
          </div>
          {mode === 'existing' ? <>
            <div className="flex gap-2"><Input aria-label="Buscar servicios del catálogo" placeholder="Buscar en el catálogo de esta sucursal…" value={search} maxLength={100} disabled={locked} onChange={(event) => setSearch(event.target.value)} /><Button variant="secondary" disabled={locked} onClick={() => { setQuery(search.trim()); setPage(1); setRevision((value) => value + 1) }}>Buscar</Button></div>
            <div className="divide-y rounded-xl border border-slate-200">{catalog?.items.map((item) => <label key={item.itemId} className="flex items-start gap-3 p-3 text-sm"><input className="mt-1" type="checkbox" disabled={locked || loading || !!loadError || (selected.length >= 20 && !selected.some((line) => line.itemId === item.itemId))} checked={selected.some((line) => line.itemId === item.itemId)} onChange={(event) => setSelected((rows) => event.target.checked ? [...rows, { ...item, washerRate: '20', supervisorRate: '5' }] : rows.filter((line) => line.itemId !== item.itemId))} /><span className="min-w-0 flex-1"><strong className="break-words">{item.name}</strong><span className="block text-xs text-slate-500">{item.categoryName}</span></span><span className="shrink-0 text-emerald-700">{money(item.salePrice)}</span></label>)}</div>
            {!loading && !catalog?.items.length && <p className="text-sm text-slate-500">No hay servicios disponibles con esta búsqueda. Crea servicios o habilita su disponibilidad en <SetupLink href="/inventarios?tab=productos">Inventarios</SetupLink>.</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{selected.length} seleccionados · Página {page} de {Math.max(1, catalog?.totalPages || 0)}</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={locked || loading || page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button size="sm" variant="secondary" disabled={locked || loading || page >= (catalog?.totalPages || 0)} onClick={() => setPage(page + 1)}>Siguiente</Button></div></div>
            {selected.map((line) => <fieldset key={line.itemId} className="space-y-3 rounded-xl bg-slate-50 p-4"><legend className="px-1 text-sm font-semibold">{line.name}</legend><Rates line={line} disabled={locked} onChange={(changes) => setSelected((rows) => rows.map((row) => row.itemId === line.itemId ? { ...row, ...changes } : row))} /><Button size="sm" variant="ghost" disabled={locked} onClick={() => setSelected((rows) => rows.filter((row) => row.itemId !== line.itemId))}>Quitar selección</Button></fieldset>)}
          </> : <>
            {lines.map((line, index) => <fieldset key={line.key} className="space-y-4 rounded-xl border border-slate-200 p-4" data-testid={`carwash-service-line-${index}`}>
              <legend className="px-1 text-sm font-semibold">Servicio {index + 1}</legend>
              <Field label="Nombre del servicio" value={line.name} maxLength={160} disabled={locked} onChange={(event) => changeLine(index, { name: event.target.value })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div><p className="mb-2 text-xs font-semibold text-slate-700">Categoría</p><Select aria-label={`Categoría del servicio ${index + 1}`} value={line.categoryId} options={options?.categories || []} disabled={locked} onChange={(value) => changeLine(index, { categoryId: value })} /></div>
                <div><p className="mb-2 text-xs font-semibold text-slate-700">Unidad</p><Select aria-label={`Unidad del servicio ${index + 1}`} value={line.unitOfMeasureId} options={options?.units || []} disabled={locked} onChange={(value) => changeLine(index, { unitOfMeasureId: value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Precio sin impuestos" inputMode="decimal" value={line.salePrice} disabled={locked} onChange={(event) => changeLine(index, { salePrice: event.target.value })} /><Field label="Impuesto (%)" inputMode="decimal" value={line.taxRate} disabled={locked} onChange={(event) => changeLine(index, { taxRate: event.target.value })} /></div>
              <Rates line={line} disabled={locked} onChange={(changes) => changeLine(index, changes)} />
              {lines.length > 1 && <Button size="sm" variant="ghost" disabled={locked} aria-label={`Quitar servicio ${index + 1}`} onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))}><Trash2 className="h-4 w-4" aria-hidden />Quitar</Button>}
            </fieldset>)}
            <Button variant="secondary" disabled={locked || lines.length >= 20} onClick={() => setLines((rows) => [...rows, { ...newLine(), unitOfMeasureId: rows[0].unitOfMeasureId }])}><Plus className="h-4 w-4" aria-hidden />Añadir otro servicio</Button>
            {!options?.categories.length && <p className="text-sm text-amber-800">Necesitas una categoría activa. <SetupLink href="/configuracion/categorias">Crear categoría</SetupLink></p>}
            {!options?.units.length && <p className="text-sm text-amber-800">No hay unidades activas. Un administrador debe revisar las unidades del catálogo antes de crear servicios.</p>}
          </>}
          <p className="text-xs text-slate-500">Máximo 20 servicios por registro. <SetupLink href="/configuracion/categorias">Administrar categorías</SetupLink></p>
        </>}
        {options?.employeeCount === 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Esta sucursal aún no tiene empleados activos. Puedes configurar servicios ahora y <SetupLink href="/rrhh/directorio">asignar empleados</SetupLink> antes de recibir lavados.</p>}
        {!current && <Button size="sm" variant="ghost" disabled={busy || loading || uncertain} onClick={() => setRevision((value) => value + 1)}>Actualizar catálogo y opciones</Button>}
      </div>
      <div className="shrink-0 space-y-3 border-t border-slate-100 bg-white p-4">
        {error && <p role="alert" className="text-sm text-red-700">{error.message}{error.status === 409 && current ? ' Usa «Recargar valores actuales» para revisar la última versión.' : ''}</p>}
        {uncertain && <p role="status" className="text-xs text-amber-800">No se pudo confirmar el resultado. Reintenta el mismo registro; no se duplicarán servicios. {current ? 'Si ya se guardó, recarga los valores actuales.' : ''}</p>}
        {!writable && <p role="status" className="text-sm text-amber-800">Solo lectura hasta recuperar la conexión. Tus cambios se conservan.</p>}
        <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={busy || uncertain} onClick={onClose}>Cerrar</Button><Button data-testid="carwash-save-services" disabled={!writable || busy || loading || !!loadError || (!current && mode === 'new' && !options?.canCreateServices)} onClick={save}>{busy ? 'Guardando…' : uncertain ? 'Reintentar registro' : current ? 'Guardar cambios' : 'Guardar servicios'}</Button></div>
      </div>
    </div>
  </Modal>
}
