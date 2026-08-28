import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Package, Plus, Search, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useCatalogStore } from '@/stores/catalogStore'
import { useInventarioStore } from '@/stores/inventarioStore'
import { useAgendaStore } from '@/stores/agendaStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useBranchStaff, resolveStaffName } from '@/modules/rrhh/lib/staff'

function appointmentLabel(a) {
  return `${a.customerName} · ${a.serviceName || 'Cita'} · ${a.date} ${a.time}`
}

export function SalidaMultipleModal({ open, onClose, branchId = 'all' }) {
  const products = useCatalogStore((s) => s.products)
  const recordSalida = useInventarioStore((s) => s.recordSalidaMultiple)
  const appointments = useAgendaStore((s) => s.appointments)
  const rrhhEmployees = useRrhhStore((s) => s.employees)
  const effectiveBranch = branchId === 'all' ? 'charm-dn' : branchId
  const branchStaff = useBranchStaff(effectiveBranch)
  const employeeOptions = useMemo(
    () => [{ value: '', label: 'Seleccionar empleado…' }, ...branchStaff.map((e) => ({ value: e.id, label: e.name }))],
    [branchStaff]
  )

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  const [appointmentId, setAppointmentId] = useState('')
  const [comment, setComment] = useState('')

  const supplies = useMemo(() => products.filter((p) => p.type === 'supply' && p.stock !== null), [products])

  const appointmentOptions = useMemo(() => {
    const base = [{ value: '', label: 'Sin cita vinculada' }]
    const filtered = appointments
      .filter((a) => !employeeId || a.employeeId === employeeId)
      .filter((a) => !['cancelada', 'noshow'].includes(a.status))
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
      .slice(0, 40)
      .map((a) => ({ value: a.id, label: appointmentLabel(a) }))
    return [...base, ...filtered]
  }, [appointments, employeeId])

  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    const picked = new Set(selected.map((s) => s.id))
    return supplies.filter((p) => {
      if (picked.has(p.id)) return false
      if (branchId !== 'all' && p.branchId !== branchId) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.sku && String(p.sku).toLowerCase().includes(q))
    })
  }, [supplies, selected, query, branchId])

  const addProduct = (p) => setSelected((list) => [...list, { id: p.id, name: p.name, sku: p.sku, stock: p.stock, qty: 1 }])
  const removeProduct = (id) => setSelected((list) => list.filter((i) => i.id !== id))
  const setQty = (id, qty) =>
    setSelected((list) => list.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Number(qty) || 1) } : i)))

  const reset = () => {
    setQuery('')
    setSelected([])
    setEmployeeId('')
    setAppointmentId('')
    setComment('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const submit = () => {
    if (!selected.length) return toast.error('Selecciona al menos un insumo.')
    if (!employeeId) return toast.error('Selecciona el empleado responsable.')
    const invalid = selected.find((i) => i.qty > i.stock)
    if (invalid) return toast.error(`"${invalid.name}" no tiene stock suficiente.`)

    const employeeName = resolveStaffName(employeeId, rrhhEmployees)
    const appointment = appointments.find((a) => a.id === appointmentId)
    recordSalida({
      items: selected,
      employeeId,
      employeeName,
      appointmentId: appointmentId || null,
      appointmentLabel: appointment ? appointmentLabel(appointment) : null,
      comment,
      branchId,
    })
    toast.success(`Salida registrada (${selected.length} insumo${selected.length > 1 ? 's' : ''})`)
    handleClose()
  }

  if (!open) return null

  return (
    <Modal
      open
      onClose={handleClose}
      xlarge
      bodyClassName="!p-0"
      testId="salida-multiple-modal"
      title={
        <div>
          <h2 className="font-heading text-lg font-semibold text-slate-900">Salida Múltiple de Insumos</h2>
          <p className="mt-1 text-sm font-normal text-slate-500">Registra salidas de materia prima atribuidas a empleado y cita.</p>
        </div>
      }
    >
      <div className="grid min-h-[420px] grid-cols-1 border-t border-slate-100 md:grid-cols-2">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-6 md:border-b-0 md:border-r">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar insumos..."
              data-testid="salida-search"
              className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {available.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                data-testid={`salida-add-${p.id}`}
                className="group flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">{p.name}</p>
                  <p className="text-[10px] text-slate-400">Stock: {p.stock} {p.unit || 'ud'}</p>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-blue-600 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
            {available.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">No hay insumos disponibles.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col p-6">
          <p className="mb-3 text-sm font-semibold text-slate-700">Insumos seleccionados</p>
          <div className="min-h-[160px] flex-1 space-y-2 overflow-y-auto scrollbar-thin">
            {selected.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center opacity-50">
                <Package className="mb-2 h-10 w-10 text-slate-300" />
                <p className="text-xs text-slate-400">Selecciona insumos a la izquierda</p>
              </div>
            ) : (
              selected.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-100 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                    <p className="text-[10px] text-slate-400">Stock: {item.stock}</p>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max={item.stock}
                    value={item.qty}
                    onChange={(e) => setQty(item.id, e.target.value)}
                    className="w-16 rounded-lg border-0 bg-slate-50 px-2 py-1.5 text-center text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
                  />
                  <button type="button" onClick={() => removeProduct(item.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Empleado responsable *</label>
              <Select
                value={employeeId}
                onChange={(v) => {
                  setEmployeeId(v)
                  setAppointmentId('')
                }}
                options={employeeOptions}
                size="sm"
                data-testid="salida-employee"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Cita vinculada (opcional)</label>
              <Select value={appointmentId} onChange={setAppointmentId} options={appointmentOptions} size="sm" data-testid="salida-appointment" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Comentario</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Detalles de la salida..."
                rows={2}
                className="w-full resize-none rounded-xl border-0 bg-white p-3 text-xs ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-orange-400"
              />
            </div>
            <Button onClick={submit} className="w-full bg-orange-600 hover:bg-orange-700" data-testid="salida-confirm">
              Confirmar Salida Múltiple
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
