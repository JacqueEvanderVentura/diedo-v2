import { useEffect, useMemo, useState } from 'react'
import { Hash } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AttachmentField } from '@/components/ui/AttachmentField'
import { formatDOP } from '@/lib/format'
import { usePosStore } from '@/stores/posStore'
import { useConfigStore } from '@/stores/configStore'
import { syncWorkspacePaymentMethods } from '@/lib/paymentMethodsSync'
import {
  paymentMethodSemanticCode,
  resolveCashDrawerPaymentMethod,
} from '@/services/adapters/pos'
import { uploadCashMovementAttachments } from '@/lib/documentAttachments'
import { saveExpenseAttachments } from '@/modules/finanzas/lib/financeAttachments'
import { cn } from '@/lib/utils'

const TYPES = [
  { id: 'ingreso', label: 'Ingreso' },
  { id: 'egreso', label: 'Egreso' },
]

function cashDrawerPaymentMethods(methods) {
  return (methods || []).filter(
    (method) => method.enabled !== false
      && (method.affectsCash || paymentMethodSemanticCode(method) === 'efectivo'),
  )
}

export function MovementModal({ open, onClose, defaultType = 'ingreso' }) {
  const [type, setType] = useState(defaultType)
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [methodsLoading, setMethodsLoading] = useState(false)
  const paymentMethods = useConfigStore((s) => s.paymentMethods)
  const addIncome = usePosStore((s) => s.addIncome)
  const addExpense = usePosStore((s) => s.addExpense)
  const register = usePosStore((s) => s.register)

  const cashMethods = useMemo(
    () => cashDrawerPaymentMethods(paymentMethods),
    [paymentMethods],
  )

  const methodOptions = useMemo(
    () => cashMethods.map((m) => ({ value: m.id, label: m.name })),
    [cashMethods],
  )

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setMethodsLoading(true)
    syncWorkspacePaymentMethods()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMethodsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const defaultMethod = resolveCashDrawerPaymentMethod(paymentMethods)
    const nextId = defaultMethod?.id || cashMethods[0]?.id || ''
    setMethod((current) => (
      current && cashMethods.some((m) => m.id === current) ? current : nextId
    ))
  }, [open, paymentMethods, cashMethods])

  const reset = () => {
    setConcept('')
    setAmount('')
    setReference('')
    setAttachments([])
    setError('')
    setType(defaultType)
    const defaultMethod = resolveCashDrawerPaymentMethod(useConfigStore.getState().paymentMethods)
    const options = cashDrawerPaymentMethods(useConfigStore.getState().paymentMethods)
    setMethod(defaultMethod?.id || options[0]?.id || '')
  }

  const submit = async () => {
    if (!concept.trim()) return setError('Ingresa un concepto.')
    if (!amount || Number(amount) <= 0) return setError('Ingresa un monto válido.')
    const selected = cashMethods.find((m) => m.id === method)
    if (!selected) {
      return setError('Selecciona un método de pago que afecte la caja.')
    }
    if (!selected.apiId) {
      return setError(
        'No hay un método de efectivo sincronizado para registrar el movimiento de caja.',
      )
    }
    const payload = {
      concept: concept.trim(),
      amount: Number(amount),
      method: selected.id,
      reference: reference.trim() || null,
    }
    setSubmitting(true)
    try {
      if (type === 'ingreso') {
        await addIncome(payload)
        toast.success(`Ingreso registrado: ${formatDOP(amount)}`)
      } else {
        const movement = await addExpense(payload)
        const movementId = movement?.id
        if (movementId && attachments.length) {
          if (register?.id) {
            try {
              await uploadCashMovementAttachments(register.id, movementId, attachments)
            } catch {
              saveExpenseAttachments(movementId, attachments)
            }
          } else {
            saveExpenseAttachments(movementId, attachments)
          }
        }
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
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Método de pago</label>
          {methodOptions.length > 1 ? (
            <Select
              value={method}
              onChange={(v) => { setMethod(v); setError('') }}
              options={methodOptions}
              disabled={methodsLoading || submitting}
              data-testid="caja-movement-payment-method"
            />
          ) : (
            <p
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
              data-testid="caja-movement-payment-method"
            >
              {methodOptions.find((o) => o.value === method)?.label
                || (methodsLoading ? 'Cargando métodos…' : 'Sin método de caja disponible')}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Referencia (opcional)</label>
          <div className="relative">
            <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={reference}
              onChange={(e) => { setReference(e.target.value); setError('') }}
              placeholder="N° comprobante"
              className="pl-9"
            />
          </div>
        </div>
        {type === 'egreso' && (
          <AttachmentField
            value={attachments}
            onChange={setAttachments}
            testId="caja-movement-attachments"
          />
        )}
        {error && <p className="text-sm font-medium text-red-500">{error}</p>}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button className="flex-1" onClick={submit} disabled={submitting || methodsLoading || !method}>Registrar</Button>
        </div>
      </div>
    </Modal>
  )
}