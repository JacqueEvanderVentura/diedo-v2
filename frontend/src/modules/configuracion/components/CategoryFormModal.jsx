import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CATEGORY_TYPES, CATEGORY_COLORS } from '@/stores/configStore'
import { cn } from '@/lib/utils'

const TYPE_OPTIONS = CATEGORY_TYPES.map((t) => ({ value: t.id, label: t.name }))

const empty = () => ({ name: '', description: '', type: 'producto', color: CATEGORY_COLORS[0].id, active: true })

export function CategoryFormModal({ open, onClose, category, onSubmit }) {
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const editing = !!category

  useEffect(() => {
    if (!open) return
    setForm(category ? { ...empty(), ...category } : empty())
    setErr('')
  }, [open, category])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre de la categoría.')
    onSubmit(form)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Categoría' : 'Nueva Categoría'} testId="categoria-modal">
      <p className="mb-4 text-sm text-slate-500">Crea una nueva categoría para clasificar tus gastos, ingresos o productos.</p>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre *</label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre de la categoría" data-testid="categoria-field-name" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Descripción</label>
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Descripción breve" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo</label>
          <Select value={form.type} onChange={(v) => set('type', v)} options={TYPE_OPTIONS} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Color</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set('color', c.id)}
                className={cn('h-8 w-8 rounded-full ring-2 ring-offset-2 transition-all', form.color === c.id ? 'ring-blue-600 scale-110' : 'ring-transparent')}
                style={{ backgroundColor: c.fg }}
              />
            ))}
          </div>
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} data-testid="categoria-save">{editing ? 'Guardar' : 'Crear Categoría'}</Button>
        </div>
      </div>
    </Modal>
  )
}
