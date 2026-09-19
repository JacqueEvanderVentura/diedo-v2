import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

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
}) {
  const confirmVariant = tone === 'danger' ? 'dangerSolid' : 'primary'

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
          {description && (
            <p className="text-sm leading-relaxed text-slate-600">{description}</p>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
            {busy ? 'Procesando…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
