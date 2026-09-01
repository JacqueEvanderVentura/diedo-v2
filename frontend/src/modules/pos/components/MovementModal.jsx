import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDOP } from '@/lib/format'
import { usePosStore } from '@/stores/posStore'
import { cn } from '@/lib/utils'

const TYPES = [
  { id: 'ingreso', label: 'Ingreso' },
  { id: 'egreso', label: 'Egreso' },
]

export function MovementModal({ open, onClose, defaultType = 'ingreso' }) {
  const [type, setType] = useState(defaultType)
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const addIncome = usePosStore((s) => s.addIncome)
  const addExpense = usePosStore((s) => s.addExpense)

  const reset = () => {
    setConcept('')
    setAmount('')
    setError('')
    setType(defaultType)
  }

  const submit = async () => {
    if (!concept.trim()) return setError('Ingresa un concepto.')
    if (!amount || Number(amount) <= 0) return setError('Ingresa un monto válido.')
    const payload = { concept: concept.trim(), amount: Number(amount) }
    setSubmitting(true)
    try {
      if (type === 'ingreso') {
        await addIncome(payload)
        toast.success(`Ingreso registrado: ${formatDOP(amount)}`)
      } else {
        await addExpense(payload)
        toast.success(`Egreso registrado: ${formatDOP(amount)}`)
      }
      reset()
      onClose()
    } catch (operationError) {
      setError(operationError.message || 'No se pudo registrar el movimiento.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Registrar movimiento" testId="caja-movement-modal">
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setType(t.id); setError('') }}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              type === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Concepto</label>
          <Input value={concept} onChange={(e) => { setConcept(e.target.value); setError('') }} placeholder={type === 'ingreso' ? 'Ej. Ajuste de caja' : 'Ej. Propina, insumos'} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Monto (RD$)</label>
          <Input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }} placeholder="0.00" />
        </div>
        {error && <p className="text-sm font-medium text-red-500">{error}</p>}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={submitting}>Registrar</Button>
        </div>
      </div>
    </Modal>
  )
}
