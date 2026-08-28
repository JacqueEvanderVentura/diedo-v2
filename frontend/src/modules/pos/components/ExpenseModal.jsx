import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDOP } from '@/lib/format'
import { usePosStore } from '@/stores/posStore'

export function ExpenseModal({ open, onClose }) {
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const addExpense = usePosStore((s) => s.addExpense)

  const submit = () => {
    if (!concept.trim()) return setError('Ingresa un concepto para el gasto.')
    if (!amount || Number(amount) <= 0) return setError('Ingresa un monto válido.')
    addExpense({ concept: concept.trim(), amount: Number(amount) })
    toast.success(`Gasto registrado: ${concept} · ${formatDOP(amount)}`)
    setConcept('')
    setAmount('')
    setError('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar gasto" testId="pos-expense-modal">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Concepto</label>
          <Input
            value={concept}
            onChange={(e) => {
              setConcept(e.target.value)
              setError('')
            }}
            placeholder="Ej. Compra de insumos"
            data-testid="expense-concept"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Monto (RD$)</label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError('')
            }}
            placeholder="0.00"
            data-testid="expense-amount"
          />
        </div>
        {error && (
          <p className="text-sm font-medium text-red-500" data-testid="expense-error">
            {error}
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} data-testid="expense-cancel">
            Cancelar
          </Button>
          <Button className="flex-1" onClick={submit} data-testid="expense-submit">
            Registrar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
