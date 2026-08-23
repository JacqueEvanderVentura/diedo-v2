import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Store, Save } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'

function GeneralSettings() {
  const settings = useConfigStore((s) => s.settings)
  const updateSettings = useConfigStore((s) => s.updateSettings)
  const [form, setForm] = useState(settings)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const save = () => { updateSettings({ ...form, taxDefault: Number(form.taxDefault) || 0 }); toast.success('Ajustes generales guardados') }

  return (
    <Card className="p-6" data-testid="config-general-card">
      <h3 className="mb-4 font-heading text-lg font-bold text-slate-800">Ajustes generales</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre del negocio</label>
          <Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} data-testid="config-business-name" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Región</label>
          <Input value={form.region} onChange={(e) => set('region', e.target.value)} data-testid="config-region" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Impuesto default (%)</label>
          <Input type="number" value={form.taxDefault} onChange={(e) => set('taxDefault', e.target.value)} data-testid="config-tax-default" />
        </div>
        <div className="flex items-end">
          <Button className="w-full" onClick={save} data-testid="config-general-save"><Save className="h-4 w-4" /> Guardar</Button>
        </div>
      </div>
    </Card>
  )
}

export default function SucursalesPage() {
  const branches = useConfigStore((s) => s.branches)
  const addBranch = useConfigStore((s) => s.addBranch)
  const updateBranch = useConfigStore((s) => s.updateBranch)
  const deleteBranch = useConfigStore((s) => s.deleteBranch)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  const openNew = () => { setEditing(null); setName(''); setErr(''); setModalOpen(true) }
  const openEdit = (b) => { setEditing(b); setName(b.name); setErr(''); setModalOpen(true) }
  const submit = () => {
    if (!name.trim()) return setErr('Ingresa el nombre de la sucursal.')
    if (editing) { updateBranch(editing.id, { name: name.trim() }); toast.success('Sucursal actualizada') }
    else { addBranch(name.trim()); toast.success('Sucursal creada') }
    setModalOpen(false)
  }
  const remove = (b) => {
    if (branches.length <= 1) return toast.error('Debe existir al menos una sucursal')
    deleteBranch(b.id); toast.success('Sucursal eliminada')
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6 sm:p-8">
      <GeneralSettings />

      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold text-slate-800">Sucursales</h3>
        <Button onClick={openNew} data-testid="sucursal-new-btn"><Plus className="h-4 w-4" /> Nueva sucursal</Button>
      </div>

      <Card className="overflow-hidden" data-testid="sucursales-table">
        <div className="divide-y divide-slate-50">
          {branches.map((b) => (
            <div key={b.id} className="flex items-center gap-4 px-6 py-4" data-testid={`sucursal-row-${b.id}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Store className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{b.name}</p>
                <p className="text-xs text-slate-400">ID: {b.id}</p>
              </div>
              <button onClick={() => updateBranch(b.id, { active: !b.active })} data-testid={`sucursal-toggle-${b.id}`}>
                <Badge tone={b.active ? 'success' : 'neutral'}>{b.active ? 'Activa' : 'Inactiva'}</Badge>
              </button>
              <button onClick={() => openEdit(b)} data-testid={`sucursal-edit-${b.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(b)} data-testid={`sucursal-delete-${b.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar sucursal' : 'Nueva sucursal'} testId="sucursal-modal">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
            <Input value={name} onChange={(e) => { setName(e.target.value); setErr('') }} placeholder="Ej. Charm Este" data-testid="sucursal-field-name" />
          </div>
          {err && <p className="text-sm font-medium text-red-500">{err}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)} data-testid="sucursal-cancel">Cancelar</Button>
            <Button className="flex-1" onClick={submit} data-testid="sucursal-save">{editing ? 'Guardar' : 'Crear'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
