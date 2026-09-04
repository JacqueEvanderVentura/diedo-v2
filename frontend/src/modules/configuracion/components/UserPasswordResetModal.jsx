import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { newPasswordError, PASSWORD_REQUIREMENTS } from '@/lib/passwordPolicy'

export function UserPasswordResetModal({ open, user, onClose, onSubmit, submitting = false }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPassword('')
    setConfirmation('')
    setError('')
  }, [open, user?.id])

  const handleClose = () => {
    if (!submitting) onClose?.()
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const policyError = newPasswordError(password)
    if (policyError) return setError(policyError)
    if (password !== confirmation) return setError('Las contraseñas no coinciden.')

    try {
      await onSubmit?.(password)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo restablecer la contraseña.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Restablecer contraseña"
      testId="usuario-password-modal"
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Define una nueva contraseña para <strong>{user?.name}</strong>. Al guardarla se cerrarán
            todas sus sesiones activas.
          </p>
        </div>

        <div>
          <label htmlFor="usuario-password-new" className="mb-1.5 block text-sm font-medium text-slate-600">
            Nueva contraseña
          </label>
          <Input
            id="usuario-password-new"
            type="password"
            autoComplete="new-password"
            value={password}
            disabled={submitting}
            onChange={(event) => {
              setPassword(event.target.value)
              setError('')
            }}
            placeholder="Mínimo 8 caracteres"
            autoFocus
            data-testid="usuario-password-new"
          />
          <p className="mt-1.5 text-xs text-slate-500">{PASSWORD_REQUIREMENTS}</p>
        </div>

        <div>
          <label htmlFor="usuario-password-confirm" className="mb-1.5 block text-sm font-medium text-slate-600">
            Confirmar contraseña
          </label>
          <Input
            id="usuario-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            disabled={submitting}
            onChange={(event) => {
              setConfirmation(event.target.value)
              setError('')
            }}
            placeholder="Repite la nueva contraseña"
            data-testid="usuario-password-confirm"
          />
        </div>

        {error && (
          <p className="text-sm font-medium text-red-600" role="alert" data-testid="usuario-password-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting} data-testid="usuario-password-submit">
            {submitting ? 'Guardando…' : 'Restablecer contraseña'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
