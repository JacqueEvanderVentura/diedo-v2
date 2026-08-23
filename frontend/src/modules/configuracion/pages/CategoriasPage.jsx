import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export default function CategoriasPage() {
  const categories = useConfigStore((s) => s.categories)
  const addCategory = useConfigStore((s) => s.addCategory)
  const updateCategory = useConfigStore((s) => s.updateCategory)
  const deleteCategory = useConfigStore((s) => s.deleteCategory)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  const openNew = () => { setEditing(null); setName(''); setErr(''); setModalOpen(true) }
  const openEdit = (c) => { setEditing(c); setName(c.name); setErr(''); setModalOpen(true) }
  const submit = () => {
    if (!name.trim()) return setErr('Ingresa el nombre de la categoría.')
    if (editing) { updateCategory(editing.id, name.trim()); toast.success('Categoría actualizada') }
    else { addCategory(name.trim()); toast.success('Categoría creada') }
    setModalOpen(false)
  }
  const remove = (c) => { deleteCategory(c.id); toast.success('Categoría eliminada') }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6 sm:p-8">
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-700">
        <Tag className="h-4 w-4 shrink-0" /> Estas categorías se usan en el POS e Inventarios.
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold text-slate-800">Categorías</h3>
        <Button onClick={openNew} data-testid="categoria-new-btn"><Plus className="h-4 w-4" /> Nueva categoría</Button>
      </div>

      <Card className="overflow-hidden" data-testid="categorias-table">
        <div className="divide-y divide-slate-50">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-6 py-4" data-testid={`categoria-row-${c.id}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Tag className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-400">ID: {c.id}</p>
              </div>
              <button onClick={() => openEdit(c)} data-testid={`categoria-edit-${c.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(c)} data-testid={`categoria-delete-${c.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar categoría' : 'Nueva categoría'} testId="categoria-modal">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
            <Input value={name} onChange={(e) => { setName(e.target.value); setErr('') }} placeholder="Ej. Promociones" data-testid="categoria-field-name" />
          </div>
          {err && <p className="text-sm font-medium text-red-500">{err}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)} data-testid="categoria-cancel">Cancelar</Button>
            <Button className="flex-1" onClick={submit} data-testid="categoria-save">{editing ? 'Guardar' : 'Crear'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
