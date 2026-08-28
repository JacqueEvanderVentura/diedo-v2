import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Upload, CheckCircle2, Hash } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { formatDOP } from '@/lib/format'
import { usePosStore } from '@/stores/posStore'
import { getBalance, PAYMENT_METHODS } from '@/modules/pos/lib/receivables'
import { cn } from '@/lib/utils'

const NEEDS_PROOF = ['transferencia', 'link']

export function ReceivablePaymentModal({ open, onClose, receivable }) {
  const addReceivablePayment = usePosStore((s) => s.addReceivablePayment)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState(null)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  const balance = receivable ? getBalance(receivable) : 0
  const needsProof = NEEDS_PROOF.includes(method)

  useEffect(() => {
    if (!open || !receivable) return
    setAmount(String(balance))
    setMethod('efectivo')
    setReference('')
    setNote('')
    setProof(null)
    setErr('')
  }, [open, receivable, balance])

  const submit = () => {
    if (!receivable) return
    const val = Number(amount)
    if (!val || val <= 0) return setErr('Ingresa un monto válido.')
    if (val > balance) return setErr(`El monto no puede superar el saldo (${formatDOP(balance)}).`)
    if (needsProof && !proof && !reference.trim()) {
      return setErr('Ingresa el N° de referencia o sube el comprobante.')
    }
    addReceivablePayment(receivable.id, {
      amount: val,
      method,
      reference: reference.trim() || null,
      note: note.trim() || null,
      proof,
    })
    toast.success(val >= balance ? 'Cuenta saldada' : `Abono registrado · ${formatDOP(val)}`)
    onClose()
  }

  const payFull = () => setAmount(String(balance))

  return (
    <Modal open={open} onClose={onClose} title="Registrar pago" testId="cxc-payment-modal">
      {receivable && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Cliente</span><span className="font-semibold text-slate-800">{receivable.customer?.name}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-semibold">{formatDOP(receivable.amount)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-medium text-slate-700">Saldo pendiente</span><span className="font-heading text-lg font-bold text-red-600">{formatDOP(balance)}</span></div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-600">Monto del pago</label>
              <button type="button" onClick={payFull} className="text-xs font-semibold text-blue-600 hover:underline">Pagar saldo completo</button>
            </div>
            <Input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setErr('') }} placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Método</label>
            <Select value={method} onChange={(v) => { setMethod(v); setErr('') }} options={PAYMENT_METHODS.map((m) => ({ value: m.id, label: m.label }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              {needsProof ? 'Referencia' : 'Referencia (opcional)'}
            </label>
            <div className="relative">
              <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={reference}
                onChange={(e) => { setReference(e.target.value); setErr('') }}
                placeholder={needsProof ? 'N° de referencia' : 'N° comprobante'}
                className="pl-9"
              />
            </div>
          </div>
          {needsProof && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  setProof(f ? { name: f.name } : null)
                  setErr('')
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border border-dashed p-3 text-sm transition-colors',
                  proof
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-blue-50'
                )}
              >
                {proof ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <Upload className="h-5 w-5 shrink-0" />}
                <span className="truncate font-medium">{proof ? proof.name : 'Subir comprobante'}</span>
              </button>
              <p className="mt-1.5 text-[11px] text-slate-400">Referencia o comprobante — una de las dos.</p>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Nota (opcional)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Segundo abono" />
          </div>
          {err && <p className="text-sm text-red-500">{err}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" onClick={submit}>Registrar pago</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
