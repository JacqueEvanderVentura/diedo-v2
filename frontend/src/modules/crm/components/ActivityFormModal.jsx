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
import { useSessionStore } from '@/stores/sessionStore'
import { ACTIVITY_TYPES, ACTIVITY_TYPE_META } from '@/data/crm'
import { currentSessionActor } from '@/lib/sessionActor'

const empty = (opportunity = null) => ({
  type: 'tarea',
  title: '',
  description: '',
  opportunityId: opportunity?.id || '',
  leadId: opportunity?.leadId || null,
  customerId: opportunity?.customerId || '',
  customerName: opportunity?.customerName || '',
  branchId: opportunity?.branchId || '',
  assignedUserId: useSessionStore.getState().user?.membershipId || currentSessionActor().id,
  dueAt: '',
})

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ActivityFormModal({ open, onClose, activity, defaultOpportunityId = '' }) {
  const addActivity = useCrmStore((s) => s.addActivity)
  const updateActivity = useCrmStore((s) => s.updateActivity)
  const opportunities = useCrmStore((s) => s.opportunities)
  const users = useConfigStore((s) => s.users)
  const customers = useCustomersStore((s) => s.customers)
  const sessionStatus = useSessionStore((s) => s.status)
  const sessionUser = useSessionStore((s) => s.user)

  const [form, setForm] = useState(empty())
  const [saving, setSaving] = useState(false)
  const editing = !!activity

  useEffect(() => {
    if (open) {
      const defaultOpportunity = opportunities.find((item) => item.id === defaultOpportunityId)
      setForm(
        activity
          ? {
              type: activity.type || 'tarea',
              title: activity.title || '',
              description: activity.description || '',
              opportunityId: activity.opportunityId || '',
              leadId: activity.leadId || null,
              customerId: activity.customerId || '',
              customerName: activity.customerName || '',
              branchId: activity.branchId || '',
              assignedUserId: activity.assignedUserId
                || useSessionStore.getState().user?.membershipId
                || currentSessionActor().id,
              dueAt: toLocalInput(activity.dueAt),
            }
          : empty(defaultOpportunity)
      )
    }
  }, [open, activity, defaultOpportunityId, opportunities])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const selectOpportunity = (opportunityId) => {
    const opportunity = opportunities.find((item) => item.id === opportunityId)
    setForm((current) => ({
      ...current,
      opportunityId,
      leadId: opportunity?.leadId || null,
      customerId: opportunity?.customerId || '',
      customerName: opportunity?.customerName || current.customerName,
      branchId: opportunity?.branchId || current.branchId,
    }))
  }

  const selectCustomer = (customerId) => {
    const customer = customers.find((item) => item.id === customerId)
    setForm((current) => ({
      ...current,
      customerId,
      customerName: customer?.name || '',
      branchId: current.opportunityId
        ? current.branchId
        : customer?.branchId || customer?.branchIds?.[0] || current.branchId,
    }))
  }

  const submit = async () => {
    if (!form.title.trim()) return toast.error('Escribe un título')
    if (!form.dueAt) return toast.error('Selecciona fecha y hora de vencimiento')

    const payload = {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim(),
      customerName: form.customerName.trim(),
      opportunityId: form.opportunityId || null,
      leadId: form.leadId || null,
      customerId: form.customerId || null,
      branchId: form.branchId || null,
      assignedUserId: form.assignedUserId,
      dueAt: new Date(form.dueAt).toISOString(),
    }

    setSaving(true)
    try {
      if (editing) {
        await updateActivity(activity.id, payload)
        toast.success('Tarea actualizada')
      } else {
        await addActivity(payload)
        toast.success('Tarea creada y vinculada')
      }
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar la tarea')
    } finally {
      setSaving(false)
    }
  }

  const opportunityOptions = [
    { value: '', label: 'Sin oportunidad' },
    ...opportunities.map((item) => ({ value: item.id, label: item.title })),
  ]
  const customerOptions = [
    { value: '', label: 'Sin cliente' },
    ...customers.filter((c) => !c.isDefault).map((c) => ({ value: c.id, label: c.name })),
  ]
  const assigneeOptions = sessionStatus === 'online' && sessionUser?.membershipId
    ? [{ value: sessionUser.membershipId, label: sessionUser.name }]
    : users.filter((user) => user.active).map((user) => ({ value: user.id, label: user.name }))

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
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Oportunidad (opcional)</label>
          <Select
            value={form.opportunityId}
            onChange={selectOpportunity}
            options={opportunityOptions}
            disabled={editing}
            data-testid="activity-opportunity"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Cliente (opcional)</label>
          <Select
            value={form.customerId}
            onChange={selectCustomer}
            placeholder="Seleccionar cliente"
            options={customerOptions}
            disabled={editing || Boolean(form.opportunityId && form.customerId)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Asignado a</label>
          <Select
            value={form.assignedUserId}
            onChange={(v) => set('assignedUserId', v)}
            options={assigneeOptions}
            disabled={sessionStatus === 'online'}
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
          <Button className="flex-1" onClick={submit} disabled={saving} data-testid="activity-save">
            <Save className="h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
