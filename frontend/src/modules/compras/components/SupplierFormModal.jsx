import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useConfigStore } from '@/stores/configStore'
import { cn } from '@/lib/utils'

const empty = () => ({
  name: '',
  rnc: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  branchIds: [],
})

export function SupplierFormModal({ open, onClose, supplier, onSubmit }) {
  const branches = useConfigStore((s) => s.branches)
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = !!supplier

  useEffect(() => {
    if (!open) return
    setErr('')
    setSaving(false)
    setForm(supplier ? { ...empty(), ...supplier, branchIds: supplier.branchIds || [] } : empty())
  }, [open, supplier])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const toggleBranch = (id) =>
    setForm((f) => ({
      ...f,
      branchIds: f.branchIds.includes(id) ? f.branchIds.filter((b) => b !== id) : [...f.branchIds, id],
    }))

  const submit = async () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre del proveedor.')
    if (!form.branchIds.length) return setErr('Selecciona al menos una sucursal autorizada.')
    setSaving(true)
    setErr('')
    try {
      await onSubmit(form)
      toast.success(editing ? 'Proveedor actualizado' : 'Proveedor registrado')
      onClose()
    } catch (error) {
      setErr(error.message || 'No se pudo guardar el proveedor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar proveedor' : 'Registrar nuevo proveedor'} wide testId="supplier-modal">
      {err && <p className="mb-4 text-sm text-red-500">{err}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Nombre de la empresa / proveedor *</label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Distribuidora del Caribe" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">RNC / Identificación fiscal</label>
          <Input value={form.rnc} onChange={(e) => set('rnc', e.target.value)} placeholder="131-12345-6" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Nombre de contacto</label>
          <Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="Juan Pérez" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Teléfono</label>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="809-555-0199" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Correo electrónico</label>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="ventas@proveedor.com" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Dirección física</label>
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Calle Central #12, Santo Domingo" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase text-slate-400">Sucursales autorizadas *</label>
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBranch(b.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  form.branchIds.includes(b.id) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar proveedor'}
        </Button>
      </div>
    </Modal>
  )
}
