import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useSessionStore } from '@/stores/sessionStore'

export function PermissionElevationModal({
  open,
  onClose,
  permissionCode,
  title = 'Autorización requerida',
  description = 'Un supervisor debe confirmar sus credenciales para continuar.',
  onElevated,
}) {
  const elevateSession = useSessionStore((s) => s.elevateSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setError('')
    setSaving(true)
    try {
      await elevateSession({ email, password, permissionCode })
      setEmail('')
      setPassword('')
      onElevated?.()
      onClose()
    } catch (operationError) {
      setError(operationError.message || 'No se pudo elevar la sesión.')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (saving) return
    setError('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} testId="permission-elevation-modal">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{description}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Correo del supervisor</label>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            data-testid="elevation-email"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Contraseña</label>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            data-testid="elevation-password"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !email.trim() || !password}>
            {saving ? 'Validando…' : 'Autorizar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
