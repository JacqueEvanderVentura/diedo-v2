import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useFinanzasStore, ACCOUNT_TYPES } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'

const CURRENCY_OPTIONS = [{ value: 'DOP', label: 'Peso Dominicano (DOP)' }]

const empty = () => ({ name: '', type: 'banco', bank: '', accountNumber: '', balance: '', currency: 'DOP', branchId: '', notes: '' })

export function AccountFormModal({ open, onClose, account }) {
  const { addAccount, updateAccount } = useFinanzasStore()
  const [form, setForm] = useState(empty())
  const [err, setErr] = useState('')
  const editing = !!account

  useEffect(() => {
    if (!open) return
    const { branches } = useConfigStore.getState()
    const defaultBranch = branches.find((b) => b.active)?.id || ''
    if (account) {
      setForm({ ...empty(), ...account, balance: String(account.balance) })
    } else {
      setForm({ ...empty(), branchId: defaultBranch })
    }
    setErr('')
  }, [open, account])

  const { branches } = useConfigStore.getState()
  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const typeOptions = ACCOUNT_TYPES.map((t) => ({ value: t.id, label: t.name }))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) return setErr('Ingresa el nombre de la cuenta.')
    if (!form.branchId) return setErr('Selecciona una sucursal.')
    editing ? updateAccount(account.id, form) : addAccount(form)
    toast.success(editing ? 'Cuenta actualizada' : 'Cuenta creada')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Cuenta' : 'Nueva Cuenta'} wide testId="account-form-modal">
      <p className="mb-4 text-sm text-slate-500">Ingresa los detalles de la cuenta para su gestión financiera.</p>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo de Cuenta</label><Select value={form.type} onChange={(v) => set('type', v)} options={typeOptions} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Moneda</label><Select value={form.currency} onChange={(v) => set('currency', v)} options={CURRENCY_OPTIONS} /></div>
          <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre de la Cuenta</label><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Corriente Operativa..." /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Banco</label><Input value={form.bank} onChange={(e) => set('bank', e.target.value)} placeholder="Ej. Popular, BHD..." /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Número de Cuenta</label><Input value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Saldo Inicial / Actual</label><Input type="number" value={form.balance} onChange={(e) => set('balance', e.target.value)} /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal</label><Select value={form.branchId} onChange={(v) => set('branchId', v)} options={branchOptions} /></div>
          <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-medium text-slate-600">Descripción / Notas (Opcional)</label><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={submit}>{editing ? 'Guardar' : 'Crear Cuenta'}</Button>
        </div>
      </div>
    </Modal>
  )
}
