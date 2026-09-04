import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useConfigStore } from '@/stores/configStore'
import { authApi } from '@/services/authApi'
import { newPasswordError, PASSWORD_REQUIREMENTS } from '@/lib/passwordPolicy'

export function ChangePasswordModal({ open, onClose, userId, online = false }) {
  const changeOwnPassword = useConfigStore((s) => s.changeOwnPassword)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setErr('')
    setSaving(false)
  }

  const handleClose = () => {
    reset()
    onClose?.()
  }

  const submit = async () => {
    setErr('')
    if (!current.trim()) return setErr('Ingresa tu contraseña actual.')
    const policyError = newPasswordError(next)
    if (policyError) return setErr(policyError)
    if (next !== confirm) return setErr('Las contraseñas nuevas no coinciden.')
    if (current === next) return setErr('La nueva contraseña debe ser diferente a la actual.')

    setSaving(true)
    try {
      if (online) {
        await authApi.changePassword(current, next)
      } else {
        const result = changeOwnPassword(userId, current, next)
        if (!result.ok) return setErr(result.error)
      }
      toast.success('Contraseña actualizada correctamente.')
      handleClose()
    } catch (error) {
      setErr(error.message || 'No se pudo cambiar la contraseña.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Cambiar contraseña" testId="change-password-modal">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          {PASSWORD_REQUIREMENTS} Solo tú puedes cambiar tu propia clave.
        </p>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Contraseña actual</label>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Tu contraseña actual"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Nueva contraseña</label>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Mínimo 8 caracteres"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Confirmar nueva contraseña</label>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repite la nueva contraseña"
          />
        </div>

        {err && <p className="text-sm font-medium text-red-600">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            Guardar contraseña
          </Button>
        </div>
      </div>
    </Modal>
  )
}
