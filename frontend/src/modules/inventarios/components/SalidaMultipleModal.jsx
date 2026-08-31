import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Package, Plus, Search, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useInventarioStore } from '@/stores/inventarioStore'
import { useAgendaStore } from '@/stores/agendaStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useBranchStaff, resolveStaffName } from '@/modules/rrhh/lib/staff'

function appointmentLabel(appointment) {
  return `${appointment.customerName} · ${appointment.serviceName || 'Cita'} · ${appointment.date} ${appointment.time}`
}

export function SalidaMultipleModal({ open, onClose, branchId = 'all' }) {
  const branches = useConfigStore((state) => state.branches)
  const isOnline = useSessionStore((state) => state.isOnline())
  const loadStockItems = useInventarioStore((state) => state.loadStockItems)
  const recordSalida = useInventarioStore((state) => state.recordSalidaMultiple)
  const appointments = useAgendaStore((state) => state.appointments)
  const rrhhEmployees = useRrhhStore((state) => state.employees)
  const initialBranchId = branchId === 'all' ? branches[0]?.id || '' : branchId

  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId)
  const [stockItems, setStockItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  const [appointmentId, setAppointmentId] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  const branchStaff = useBranchStaff(selectedBranchId)
  const branchOptions = useMemo(
    () => branches.filter((branch) => branch.active !== false).map((branch) => ({ value: branch.id, label: branch.name })),
    [branches]
  )
  const employeeOptions = useMemo(
    () => [{ value: '', label: 'Seleccionar empleado…' }, ...branchStaff.map((employee) => ({ value: employee.id, label: employee.name }))],
    [branchStaff]
  )

  useEffect(() => {
    if (!open) return
    setSelectedBranchId(branchId === 'all' ? branches[0]?.id || '' : branchId)
  }, [open, branchId, branches])

  useEffect(() => {
    if (!open || !selectedBranchId) return
    let active = true
    setLoadingItems(true)
    setLoadError('')
    loadStockItems(selectedBranchId, { isOnline })
      .then((items) => {
        if (active) setStockItems(items)
      })
      .catch((error) => {
        if (active) {
          setStockItems([])
          setLoadError(error.message || 'No se pudieron cargar los insumos.')
        }
      })
      .finally(() => {
        if (active) setLoadingItems(false)
      })
    return () => {
      active = false
    }
  }, [open, selectedBranchId, isOnline, loadStockItems])

  const supplies = useMemo(
    () => stockItems.filter((item) => item.type === 'supply' && item.stock !== null),
    [stockItems]
  )

  const appointmentOptions = useMemo(() => {
    const base = [{ value: '', label: 'Sin cita vinculada' }]
    const filtered = appointments
      .filter((appointment) => appointment.branchId === selectedBranchId)
      .filter((appointment) => !employeeId || appointment.employeeId === employeeId)
      .filter((appointment) => !['cancelada', 'noshow'].includes(appointment.status))
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
      .slice(0, 40)
      .map((appointment) => ({ value: appointment.id, label: appointmentLabel(appointment) }))
    return [...base, ...filtered]
  }, [appointments, employeeId, selectedBranchId])

  const available = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const picked = new Set(selected.map((item) => item.id))
    return supplies.filter((item) => {
      if (picked.has(item.id)) return false
      if (!normalizedQuery) return true
      return item.name.toLowerCase().includes(normalizedQuery) || item.sku?.toLowerCase().includes(normalizedQuery)
    })
  }, [supplies, selected, query])

  const addProduct = (item) => setSelected((list) => [...list, { ...item, qty: 1 }])
  const removeProduct = (id) => setSelected((list) => list.filter((item) => item.id !== id))
  const setQty = (id, qty) => setSelected((list) => list.map((item) => (
    item.id === id ? { ...item, qty: Math.max(1, Number(qty) || 1) } : item
  )))

  const resetDependentFields = () => {
    setQuery('')
    setSelected([])
    setEmployeeId('')
    setAppointmentId('')
    setComment('')
    setLoadError('')
  }

  const handleBranchChange = (nextBranchId) => {
    setSelectedBranchId(nextBranchId)
    resetDependentFields()
  }

  const handleClose = () => {
    if (saving) return
    resetDependentFields()
    onClose()
  }

  const submit = async () => {
    if (!selected.length) return toast.error('Selecciona al menos un insumo.')
    if (!employeeId) return toast.error('Selecciona el empleado responsable.')
    const invalid = selected.find((item) => item.qty > item.stock)
    if (invalid) return toast.error(`"${invalid.name}" no tiene stock suficiente.`)

    setSaving(true)
    try {
      const employeeName = resolveStaffName(employeeId, rrhhEmployees)
      const appointment = appointments.find((item) => item.id === appointmentId)
      await recordSalida({
        items: selected,
        employeeId,
        employeeName,
        appointmentId: appointmentId || null,
        appointmentLabel: appointment ? appointmentLabel(appointment) : null,
        comment,
        branchId: selectedBranchId,
      }, { isOnline })
      toast.success(`Salida registrada (${selected.length} insumo${selected.length > 1 ? 's' : ''})`)
      resetDependentFields()
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo registrar la salida.')
    } finally {
      setSaving(false)
    }
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
          <p className="mt-1 text-sm font-normal text-slate-500">Registra salidas atribuidas a un empleado y, opcionalmente, a una cita.</p>
        </div>
      }
    >
      <div className="border-t border-slate-100 p-5 pb-0">
        <label className="mb-1.5 block text-xs font-medium text-slate-600">Sucursal *</label>
        <Select
          value={selectedBranchId}
          onChange={handleBranchChange}
          options={branchOptions}
          disabled={branchId !== 'all' || saving}
          size="sm"
          data-testid="salida-branch"
        />
      </div>

      <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-2">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-6 md:border-b-0 md:border-r">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar insumos..."
              data-testid="salida-search"
              className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {loadingItems && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando insumos…
              </div>
            )}
            {!loadingItems && loadError && <p className="py-8 text-center text-sm text-red-600" role="alert">{loadError}</p>}
            {!loadingItems && !loadError && available.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addProduct(item)}
                data-testid={`salida-add-${item.id}`}
                className="group flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">{item.name}</p>
                  <p className="text-[10px] text-slate-400">Stock: {item.stock} {item.unit || 'ud'}</p>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-blue-600 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
            {!loadingItems && !loadError && available.length === 0 && (
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
            ) : selected.map((item) => (
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
                  aria-label={`Cantidad de ${item.name}`}
                  onChange={(event) => setQty(item.id, event.target.value)}
                  className="w-16 rounded-lg border-0 bg-slate-50 px-2 py-1.5 text-center text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  aria-label={`Quitar ${item.name}`}
                  onClick={() => removeProduct(item.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Empleado responsable *</label>
              <Select
                value={employeeId}
                onChange={(value) => {
                  setEmployeeId(value)
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
                onChange={(event) => setComment(event.target.value)}
                placeholder="Detalles de la salida..."
                rows={2}
                className="w-full resize-none rounded-xl border-0 bg-white p-3 text-xs ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-orange-400"
              />
            </div>
            <Button
              onClick={submit}
              disabled={saving || loadingItems}
              className="w-full bg-orange-600 hover:bg-orange-700"
              data-testid="salida-confirm"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Registrando…' : 'Confirmar Salida Múltiple'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
