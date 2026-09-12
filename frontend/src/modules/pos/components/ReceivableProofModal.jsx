import { useState, useEffect, useRef } from 'react'
import { Upload, CheckCircle2, Hash, Banknote, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { formatDOP } from '@/lib/format'
import { getBalance, POS_PROOF_ACCEPT, receivableHasPaymentEvidence } from '@/modules/pos/lib/receivables'
import { usePosStore } from '@/stores/posStore'
import { cn } from '@/lib/utils'
import { ProofImagePreview } from './ProofImagePreview'

export function ReceivableProofModal({
  open,
  onClose,
  receivable,
  onConfirm,
  onCash,
  onSaveOnly,
}) {
  const [file, setFile] = useState(null)
  const [reference, setReference] = useState('')
  const [err, setErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)
  const downloadPaymentProof = usePosStore((state) => state.downloadPaymentProof)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setReference('')
      setErr('')
      return
    }
    setFile(null)
    setReference(receivable?.reference || '')
    setErr('')
  }, [open, receivable?.id, receivable?.reference])

  if (!receivable) return null

  const balance = getBalance(receivable)
  const existingProof = receivable.proof || null
  const hasExistingProof = Boolean(existingProof)
  const payload = {
    proof: file,
    reference: reference.trim() || null,
  }
  const canValidate = receivableHasPaymentEvidence(receivable, payload)
  const canSaveNewProof = Boolean(file)

  const loadProof = async (proof) => {
    if (proof instanceof Blob) return proof
    return downloadPaymentProof(proof)
  }

  const handleDownload = async (proof) => {
    try {
      const blob = proof instanceof Blob ? proof : await downloadPaymentProof(proof)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = proof?.name || 'comprobante'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar el comprobante.')
    }
  }

  const guard = async (fn) => {
    if (!canValidate) {
      setErr('Ingresa el N° de referencia o sube el comprobante.')
      return
    }
    setErr('')
    setSubmitting(true)
    try {
      await fn(payload)
    } catch (operationError) {
      setErr(operationError.message || 'No se pudo procesar el comprobante.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Validar pago con comprobante" testId="cxc-proof-modal">
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="font-heading font-bold text-slate-900">{receivable.customer?.name}</p>
          <p className="text-sm text-slate-500">Saldo pendiente: {formatDOP(balance)}</p>
        </div>

        {hasExistingProof && !file && (
          <ProofImagePreview
            proof={existingProof}
            loadProof={loadProof}
            onDownload={handleDownload}
          />
        )}

        {!hasExistingProof && (
          <p className="text-xs font-medium text-slate-500">
            Ingresa el <span className="font-semibold text-slate-600">N° de referencia</span>{' '}
            <span className="font-bold">o</span> sube el comprobante (una de las dos).
          </p>
        )}

        {hasExistingProof && (
          <p className="text-xs font-medium text-slate-500">
            Ya hay un comprobante. Puedes confirmar el pago ahora, o reemplazarlo si hace falta.
          </p>
        )}

        <div className="relative">
          <Hash className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', err && !canValidate ? 'text-red-400' : 'text-slate-400')} />
          <input
            value={reference}
            onChange={(e) => { setReference(e.target.value); setErr('') }}
            placeholder="N° de referencia de transferencia / link"
            data-testid="cxc-proof-reference"
            className={cn(
              'w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600',
              err && !canValidate ? 'ring-red-300' : 'ring-slate-200'
            )}
          />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={POS_PROOF_ACCEPT}
          className="hidden"
          data-testid="cxc-proof-file"
          onChange={(e) => {
            const next = e.target.files?.[0]
            setFile(next || null)
            setErr('')
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            data-testid="cxc-proof-upload"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-dashed p-3 text-left text-sm transition-colors',
              file
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : err && !canValidate
                  ? 'border-red-300 bg-red-50 text-red-600'
                  : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-blue-50'
            )}
          >
            {file ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : hasExistingProof ? <Paperclip className="h-5 w-5 shrink-0" /> : <Upload className="h-5 w-5 shrink-0" />}
            <span className="min-w-0 flex-1 truncate font-medium">
              {file ? file.name : hasExistingProof ? 'Reemplazar comprobante (opcional)' : 'Subir comprobante'}
            </span>
          </button>
          {file && (
            <button
              type="button"
              onClick={() => setFile(null)}
              className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              Quitar
            </button>
          )}
        </div>

        {err && <p className="text-xs font-medium text-red-500">{err}</p>}

        <div className="space-y-2 border-t border-slate-100 pt-4">
          <Button
            className="w-full"
            onClick={() => guard((next) => onConfirm(receivable, next))}
            disabled={submitting}
            data-testid="cxc-proof-confirm"
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirmar pago
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => guard((next) => onCash(receivable, next))}
            disabled={submitting}
            data-testid="cxc-proof-cash"
          >
            <Banknote className="h-4 w-4" />
            Cobrar en efectivo
          </Button>
          {canSaveNewProof && (
            <Button
              variant="ghost"
              className="w-full text-slate-600"
              onClick={() => guard((next) => onSaveOnly(receivable, next))}
              disabled={submitting}
              data-testid="cxc-proof-save-only"
            >
              Solo guardar comprobante
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
