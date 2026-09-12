import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useConfigStore } from '@/stores/configStore'
import { useCrmStore } from '@/stores/crmStore'
import { useSessionStore } from '@/stores/sessionStore'
import { currentSessionActor } from '@/lib/sessionActor'

export function CustomerQuickOpportunityModal({ open, onClose, customer, onCreated }) {
  const branches = useConfigStore((s) => s.branches)
  const addOpportunity = useCrmStore((s) => s.addOpportunity)
  const sessionUser = useSessionStore((s) => s.user)
  const [title, setTitle] = useState('')
  const [branchId, setBranchId] = useState('')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const branchOptions = useMemo(() => {
    const ids = customer?.branchIds?.length
      ? customer.branchIds
      : customer?.branchId
        ? [customer.branchId]
        : []
    const active = branches.filter((branch) => branch.active)
    const pool = ids.length ? active.filter((branch) => ids.includes(branch.id)) : active
    return pool.map((branch) => ({ value: branch.id, label: branch.name }))
  }, [branches, customer])

  useEffect(() => {
    if (!open || !customer) return
    setTitle(`${customer.name} — Oportunidad`)
    setBranchId(branchOptions[0]?.value || '')
    setValue('')
  }, [open, customer, branchOptions])

  const submit = async () => {
    if (!customer) return
    if (!title.trim()) return toast.error('Escribe un título')
    if (!branchId) return toast.error('Selecciona una sucursal')
    setSaving(true)
    try {
      const saved = await addOpportunity({
        title: title.trim(),
        customerName: customer.name,
        customerId: customer.id,
        branchId,
        value: Number(value) || 0,
        stage: 'nuevo',
        assignedUserId: sessionUser?.membershipId || currentSessionActor().id,
        notes: '',
      })
      toast.success('Oportunidad creada en el pipeline')
      onCreated?.(saved)
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo crear la oportunidad')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva oportunidad" testId="customer-quick-opportunity-modal">
      {customer && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Cliente: <span className="font-semibold text-slate-900">{customer.name}</span>
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Título</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sucursal</label>
            <Select value={branchId} onChange={setBranchId} options={branchOptions} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Valor estimado (DOP)</label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Creando…' : 'Crear oportunidad'}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
