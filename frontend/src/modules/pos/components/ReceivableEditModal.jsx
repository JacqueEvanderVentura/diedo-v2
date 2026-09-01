import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'

export function ReceivableEditModal({ open, onClose, receivable }) {
  const updateReceivable = usePosStore((s) => s.updateReceivable)
  const isOnline = useSessionStore((s) => s.status === 'online')
  const [reference, setReference] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !receivable) return
    setReference(receivable.reference || '')
    setDueDate(receivable.dueDate || '')
    setNotes(receivable.notes || '')
    setErr('')
  }, [open, receivable])

  const submit = async () => {
    if (!receivable) return
    setSubmitting(true)
    try {
      await updateReceivable(receivable.id, { reference: reference.trim() || null, dueDate: dueDate || null, notes: notes.trim() })
      toast.success('Cuenta actualizada')
      onClose()
    } catch (operationError) {
      setErr(operationError.message || 'No se pudo actualizar la cuenta.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar cuenta por cobrar" testId="cxc-edit-modal">
      {receivable && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Cliente</p>
            <p className="font-heading font-bold text-slate-900">{receivable.customer?.name}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Referencia</label>
            <Input value={reference} disabled={isOnline} onChange={(e) => setReference(e.target.value)} placeholder="TRF-8842" />
            {isOnline && <p className="mt-1 text-xs text-slate-400">La referencia de origen es inmutable en línea.</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Vencimiento</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl border-0 bg-slate-50 px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
              placeholder="Acuerdos de pago, observaciones..."
            />
          </div>
          {err && <p className="text-sm text-red-500">{err}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" onClick={submit} disabled={submitting}>Guardar cambios</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
