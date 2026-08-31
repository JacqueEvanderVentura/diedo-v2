import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useComprasStore } from '@/stores/comprasStore'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { REQUEST_PRIORITIES } from '@/data/compras'
import { buildBranchFilterOptions } from '@/lib/branches'

const emptyItem = () => ({ name: '', qty: 1, unit: 'unidad', price: 0 })

export function PurchaseRequestModal({ open, onClose, onSubmit, requesterName = 'Usuario actual' }) {
  const suppliers = useComprasStore((s) => s.suppliers)
  const branches = useConfigStore((s) => s.branches)
  const posBranchId = usePosStore((s) => s.branchId)
  const branchOptions = buildBranchFilterOptions(branches, { includeAll: false })
  const [supplierId, setSupplierId] = useState('')
  const [branchId, setBranchId] = useState('charm-dn')
  const [priority, setPriority] = useState('normal')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSupplierId(suppliers[0]?.id || '')
    setBranchId(posBranchId || branches[0]?.id || 'charm-dn')
    setPriority('normal')
    setNotes('')
    setItems([emptyItem()])
    setErr('')
    setSaving(false)
  }, [open, suppliers, posBranchId, branches])

  const updateItem = (idx, field, value) =>
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))

  const addItem = () => setItems((list) => [...list, emptyItem()])
  const removeItem = (idx) => setItems((list) => (list.length <= 1 ? list : list.filter((_, i) => i !== idx)))

  const submit = async () => {
    if (!supplierId) return setErr('Selecciona un proveedor.')
    const validItems = items.filter((i) => i.name.trim())
    if (!validItems.length) return setErr('Agrega al menos un artículo.')
    setSaving(true)
    setErr('')
    try {
      await onSubmit({
        supplierId,
        branchId,
        requesterName,
        items: validItems.map((i) => ({ ...i, qty: Number(i.qty) || 1, price: Number(i.price) || 0 })),
        priority,
        notes: notes.trim(),
      })
      toast.success('Solicitud creada')
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo crear la solicitud.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva solicitud de compra" xlarge testId="purchase-request-modal">
      {err && <p className="mb-4 text-sm text-red-500">{err}</p>}
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Proveedor *</label>
            <Select
              value={supplierId}
              onChange={setSupplierId}
              placeholder="Seleccionar..."
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Sucursal</label>
            <Select value={branchId} onChange={setBranchId} options={branchOptions} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Prioridad</label>
            <Select
              value={priority}
              onChange={setPriority}
              options={REQUEST_PRIORITIES.map((p) => ({ value: p, label: p === 'alta' ? 'Alta' : 'Normal' }))}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Artículos</p>
              <p className="mt-0.5 text-xs text-slate-500">Detalla qué se comprará, la cantidad y su precio unitario.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4" /> Agregar artículo
            </Button>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Artículo {idx + 1}</p>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      aria-label={`Eliminar artículo ${idx + 1}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_110px_140px_160px]">
                  <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Descripción *</label>
                    <Input
                      placeholder="Ej. Guantes de nitrilo"
                      value={item.name}
                      onChange={(e) => updateItem(idx, 'name', e.target.value)}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Cantidad *</label>
                    <Input
                      type="number"
                      min={1}
                      step="any"
                      value={item.qty}
                      onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Unidad *</label>
                    <Input
                      placeholder="unidad, caja..."
                      value={item.unit}
                      onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                    />
                  </div>
                  <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-500">Precio unitario (RD$)</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.price}
                      onChange={(e) => updateItem(idx, 'price', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Detalles adicionales de la solicitud..."
          />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Creando…' : 'Crear solicitud'}</Button>
      </div>
    </Modal>
  )
}
