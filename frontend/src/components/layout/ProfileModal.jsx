import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useConfigStore } from '@/stores/configStore'
import { branchName } from '@/lib/branches'
import { canEditProfile } from '@/lib/permissions'
import { toast } from 'sonner'
import { authApi } from '@/services/authApi'
import { useSessionStore } from '@/stores/sessionStore'

export function ProfileModal({ open, onClose, user, permissions, online = false }) {
  const branches = useConfigStore((s) => s.branches)
  const updateOwnProfile = useConfigStore((s) => s.updateOwnProfile)
  const refreshCurrentUser = useSessionStore((s) => s.refreshCurrentUser)
  const canEdit = online || canEditProfile(permissions, user?.role)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !user) return
    setName(user.name || '')
    setEmail(user.email || '')
  }, [open, user])

  const branchLabels = useMemo(() => {
    if (!user?.branchIds?.length) return ['Sin sucursales asignadas']
    return user.branchIds.map((id) => branchName(branches, id))
  }, [user, branches])

  const handleClose = () => onClose?.()

  const submit = async () => {
    if (!canEdit || !user) return
    if (!name.trim()) return toast.error('Ingresa tu nombre.')
    if (!email.trim()) return toast.error('Ingresa tu correo.')

    setSaving(true)
    try {
      if (online) {
        await authApi.updateProfile(name.trim())
        await refreshCurrentUser()
      } else {
        updateOwnProfile(user.id, { name: name.trim(), email: email.trim() })
      }
      toast.success('Perfil actualizado.')
      handleClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar el perfil.')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <Modal open={open} onClose={handleClose} title="Mi perfil" testId="profile-modal" wide>
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 text-lg font-bold text-blue-700">
            {user.name
              ?.split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() || '??'}
          </div>
          <div className="min-w-0">
            <p className="font-heading text-base font-bold text-slate-900">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone="brand">{user.role}</Badge>
              <Badge tone={user.active ? 'success' : 'neutral'}>{user.active ? 'Activo' : 'Inactivo'}</Badge>
            </div>
          </div>
        </div>

        {canEdit ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Correo</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={online} />
              {online && <p className="mt-1 text-xs text-slate-400">El correo requiere un flujo de verificación y no se cambia aquí.</p>}
            </div>
          </div>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nombre</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Correo</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{user.email}</dd>
            </div>
          </dl>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sucursales</p>
          <div className="flex flex-wrap gap-2">
            {branchLabels.map((label) => (
              <Badge key={label} tone="neutral">
                {label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cerrar
          </Button>
          {canEdit && (
            <Button type="button" onClick={submit} disabled={saving}>
              Guardar cambios
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
