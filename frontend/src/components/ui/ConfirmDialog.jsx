import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  busy = false,
  testId = 'confirm-dialog',
  confirmPhrase = '',
  confirmPhraseLabel = '',
}) {
  const confirmVariant = tone === 'danger' ? 'dangerSolid' : 'primary'
  const [phraseInput, setPhraseInput] = useState('')
  const phraseRequired = Boolean(confirmPhrase)
  const phraseMatches =
    !phraseRequired || phraseInput.trim().toLowerCase() === confirmPhrase.trim().toLowerCase()

  useEffect(() => {
    if (!open) setPhraseInput('')
  }, [open])

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={title} testId={testId}>
      <div className="space-y-5">
        <div className="flex gap-4">
          {tone === 'danger' && (
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"
              aria-hidden
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 space-y-4">
            {description && (
              <p className="text-sm leading-relaxed text-slate-600">{description}</p>
            )}
            {phraseRequired && (
              <div>
                <label
                  htmlFor={`${testId}-phrase`}
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  {confirmPhraseLabel || `Escribe «${confirmPhrase}» para confirmar`}
                </label>
                <Input
                  id={`${testId}-phrase`}
                  value={phraseInput}
                  onChange={(event) => setPhraseInput(event.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  data-testid={`${testId}-phrase-input`}
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={busy || !phraseMatches}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
