import { useRef } from 'react'
import { CheckCircle2, Hash, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { POS_PROOF_ACCEPT } from '@/modules/pos/lib/receivables'
import {
  paymentMethodAllowsProofUpload,
  paymentMethodReferenceLabel,
  validatePaymentEvidence,
} from '@/modules/pos/lib/paymentMethods'

export function PaymentEvidenceFields({
  method,
  reference,
  onReferenceChange,
  proof,
  onProofChange,
  showError = false,
  testIdPrefix = 'payment-evidence',
}) {
  const fileRef = useRef(null)
  if (!method) return null

  const allowsProof = paymentMethodAllowsProofUpload(method)
  const validationError = showError
    ? validatePaymentEvidence(method, { reference, proof })
    : null
  const showRefError = Boolean(validationError)

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-fields`}>
      {allowsProof && (
        <p className="text-[11px] font-medium text-slate-400">
          Ingresa el <span className="font-semibold text-slate-500">N° de referencia</span>
          {' '}
          <span className="font-bold">o</span>
          {' '}
          sube el comprobante (una de las dos).
        </p>
      )}

      <div className="relative">
        <Hash
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
            showRefError ? 'text-red-400' : 'text-slate-400'
          )}
        />
        <input
          value={reference}
          onChange={(event) => onReferenceChange?.(event.target.value)}
          placeholder={paymentMethodReferenceLabel(method)}
          data-testid={`${testIdPrefix}-reference`}
          className={cn(
            'w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600',
            showRefError ? 'ring-red-300' : 'ring-slate-200'
          )}
        />
      </div>

      {allowsProof && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={POS_PROOF_ACCEPT}
            className="hidden"
            data-testid={`${testIdPrefix}-file`}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onProofChange?.(file)
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              data-testid={`${testIdPrefix}-upload`}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-dashed p-2.5 text-left text-sm transition-colors',
                proof
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : showRefError
                    ? 'border-red-300 bg-red-50 text-red-600'
                    : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-300 hover:bg-blue-50'
              )}
            >
              {proof ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <Upload className="h-5 w-5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate font-medium">
                {proof ? proof.name : 'Subir comprobante'}
              </span>
            </button>
            {proof && (
              <button
                type="button"
                onClick={() => onProofChange?.(null)}
                data-testid={`${testIdPrefix}-remove-proof`}
                className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      )}

      {validationError && (
        <p className="text-xs font-medium text-red-500" data-testid={`${testIdPrefix}-error`}>
          {validationError}
        </p>
      )}
    </div>
  )
}
