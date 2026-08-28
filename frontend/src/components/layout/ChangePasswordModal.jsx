import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useConfigStore } from '@/stores/configStore'

export function ChangePasswordModal({ open, onClose, userId }) {
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

  const submit = () => {
    setErr('')
    if (!current.trim()) return setErr('Ingresa tu contraseña actual.')
    if (!next || next.length < 6) return setErr('La nueva contraseña debe tener al menos 6 caracteres.')
    if (next !== confirm) return setErr('Las contraseñas nuevas no coinciden.')
    if (current === next) return setErr('La nueva contraseña debe ser diferente a la actual.')

    setSaving(true)
    const result = changeOwnPassword(userId, current, next)
    setSaving(false)

    if (!result.ok) {
      setErr(result.error)
      return
    }

    toast.success('Contraseña actualizada correctamente.')
    handleClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Cambiar contraseña" testId="change-password-modal">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Usa una contraseña segura de al menos 6 caracteres. Solo tú puedes cambiar tu propia clave.
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
            placeholder="Mínimo 6 caracteres"
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
