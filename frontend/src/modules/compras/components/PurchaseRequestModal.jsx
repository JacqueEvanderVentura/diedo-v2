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

  useEffect(() => {
    if (!open) return
    setSupplierId(suppliers[0]?.id || '')
    setBranchId(posBranchId || branches[0]?.id || 'charm-dn')
    setPriority('normal')
    setNotes('')
    setItems([emptyItem()])
    setErr('')
  }, [open, suppliers, posBranchId, branches])

  const updateItem = (idx, field, value) =>
    setItems((list) => list.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))

  const addItem = () => setItems((list) => [...list, emptyItem()])
  const removeItem = (idx) => setItems((list) => (list.length <= 1 ? list : list.filter((_, i) => i !== idx)))

  const submit = () => {
    if (!supplierId) return setErr('Selecciona un proveedor.')
    const validItems = items.filter((i) => i.name.trim())
    if (!validItems.length) return setErr('Agrega al menos un artículo.')
    onSubmit({
      supplierId,
      branchId,
      requesterName,
      items: validItems.map((i) => ({ ...i, qty: Number(i.qty) || 1, price: Number(i.price) || 0 })),
      priority,
      notes: notes.trim(),
    })
    toast.success('Solicitud creada')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva solicitud de compra" wide testId="purchase-request-modal">
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

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase text-slate-400">Artículos</label>
            <Button variant="ghost" size="sm" onClick={addItem}><Plus className="h-4 w-4" /> Agregar</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <Input className="col-span-5" placeholder="Descripción" value={item.name} onChange={(e) => updateItem(idx, 'name', e.target.value)} />
                <Input className="col-span-2" type="number" min={1} placeholder="Cant." value={item.qty} onChange={(e) => updateItem(idx, 'qty', e.target.value)} />
                <Input className="col-span-2" placeholder="Unidad" value={item.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)} />
                <Input className="col-span-2" type="number" min={0} placeholder="Precio" value={item.price} onChange={(e) => updateItem(idx, 'price', e.target.value)} />
                <button type="button" onClick={() => removeItem(idx)} className="col-span-1 flex items-center justify-center text-slate-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
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
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit}>Crear solicitud</Button>
      </div>
    </Modal>
  )
}
