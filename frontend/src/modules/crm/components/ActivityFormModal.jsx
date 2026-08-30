import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useCrmStore } from '@/stores/crmStore'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META } from '@/data/crm'
import { currentSessionActor } from '@/lib/sessionActor'

const empty = () => ({
  type: 'tarea',
  title: '',
  description: '',
  customerName: '',
  assignedUserId: currentSessionActor().id,
  dueAt: '',
})

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ActivityFormModal({ open, onClose, activity }) {
  const addActivity = useCrmStore((s) => s.addActivity)
  const updateActivity = useCrmStore((s) => s.updateActivity)
  const users = useConfigStore((s) => s.users)
  const customers = useCustomersStore((s) => s.customers)

  const [form, setForm] = useState(empty())
  const editing = !!activity

  useEffect(() => {
    if (open) {
      setForm(
        activity
          ? {
              type: activity.type || 'tarea',
              title: activity.title || '',
              description: activity.description || '',
              customerName: activity.customerName || '',
              assignedUserId: activity.assignedUserId || currentSessionActor().id,
              dueAt: toLocalInput(activity.dueAt),
            }
          : empty()
      )
    }
  }, [open, activity])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.title.trim()) return toast.error('Escribe un título')
    if (!form.dueAt) return toast.error('Selecciona fecha y hora de vencimiento')

    const payload = {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim(),
      customerName: form.customerName.trim(),
      assignedUserId: form.assignedUserId,
      dueAt: new Date(form.dueAt).toISOString(),
    }

    if (editing) {
      updateActivity(activity.id, payload)
      toast.success('Tarea actualizada')
    } else {
      addActivity(payload)
      toast.success('Tarea creada')
    }
    onClose()
  }

  const customerOptions = [
    { value: '', label: 'Sin cliente' },
    ...customers.filter((c) => !c.isDefault).map((c) => ({ value: c.name, label: c.name })),
  ]

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar tarea' : 'Nueva tarea'} testId="activity-form-modal">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo</label>
          <Select
            value={form.type}
            onChange={(v) => set('type', v)}
            options={ACTIVITY_TYPES.map((t) => ({ value: t, label: ACTIVITY_TYPE_META[t]?.label || t }))}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Título</label>
          <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ej. Llamar al cliente" data-testid="activity-title" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Cliente (opcional)</label>
          <Select
            value={form.customerName}
            onChange={(v) => set('customerName', v)}
            placeholder="Seleccionar cliente"
            options={customerOptions}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Asignado a</label>
          <Select
            value={form.assignedUserId}
            onChange={(v) => set('assignedUserId', v)}
            options={users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Vence el</label>
          <Input type="datetime-local" value={form.dueAt} onChange={(e) => set('dueAt', e.target.value)} data-testid="activity-due" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Descripción</label>
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Notas adicionales" />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            <X className="h-4 w-4" /> Cancelar
          </Button>
          <Button className="flex-1" onClick={submit} data-testid="activity-save">
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
