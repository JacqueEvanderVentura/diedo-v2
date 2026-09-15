import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { backofficeApi } from '@/services/backofficeApi'
import { newPasswordError } from '@/lib/passwordPolicy'
import { BackofficeSelect as Select } from './BackofficeSelect'
import { RoleAssignmentsEditor } from './RoleAssignmentsEditor'
import { assignmentPayload } from '../backofficeForm'

export function MemberFormModal({
  member,
  workspaceId: initialWorkspaceId,
  workspaces,
  onClose,
  onSaved,
}) {
  const [workspaceId, setWorkspaceId] = useState(member?.workspaceId || initialWorkspaceId || '')
  const [mode, setMode] = useState('new')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [assignments, setAssignments] = useState(
    member?.roleAssignments || [{ roleId: '', scopeType: 'branch', branchId: '' }]
  )
  const [options, setOptions] = useState({ roles: [], branches: [], legalEntities: [] })
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(member?.membershipVersion)

  useEffect(() => {
    let active = true
    setOptions({ roles: [], branches: [], legalEntities: [] })
    if (!workspaceId)
      return () => {
        active = false
      }
    setOptionsLoading(true)
    backofficeApi
      .memberOptions(workspaceId)
      .then((data) => {
        if (active) setOptions(data)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setOptionsLoading(false)
      })
    return () => {
      active = false
    }
  }, [workspaceId])

  const reload = async () => {
    try {
      const current = await backofficeApi.getMember(workspaceId, member.membershipId)
      setVersion(current.membershipVersion)
      setAssignments(current.roleAssignments)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!member && mode === 'new') {
      const validation = newPasswordError(password)
      if (validation) {
        setError(validation)
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      if (member) {
        await backofficeApi.updateMember(workspaceId, member.membershipId, {
          version,
          roleAssignments: assignmentPayload(assignments),
        })
      } else {
        await backofficeApi.createUser({
          workspaceId,
          email: email.trim(),
          displayName: mode === 'new' ? name.trim() : email.trim(),
          ...(mode === 'new' ? { password } : {}),
          roleAssignments: assignmentPayload(assignments),
        })
      }
      toast.success(member ? 'Roles actualizados' : 'Acceso registrado')
      onSaved()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el acceso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title={member ? `Roles de ${member.displayName}` : 'Registrar usuario'}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        {!member && (
          <>
            <label className="block text-sm">
              Compañía
              <Select
                required
                value={workspaceId}
                onChange={(e) => {
                  setWorkspaceId(e.target.value)
                  setAssignments([{ roleId: '', scopeType: 'branch', branchId: '' }])
                  setError('')
                }}
              >
                <option value="">Selecciona una compañía</option>
                {workspaces.map((item) => (
                  <option key={item.workspaceId} value={item.workspaceId}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              Tipo de cuenta
              <Select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value)
                  setPassword('')
                }}
              >
                <option value="new">Cuenta nueva</option>
                <option value="existing">Cuenta existente</option>
              </Select>
            </label>
            {mode === 'new' && (
              <label className="block text-sm">
                Nombre
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={160}
                />
              </label>
            )}
            <label className="block text-sm">
              Email
              <Input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {mode === 'new' ? (
              <label className="block text-sm">
                Contraseña
                <Input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            ) : (
              <p className="text-sm text-slate-500">
                La cuenta conservará su nombre y contraseña. Si ya pertenece a esta compañía,
                gestiona su acceso desde la lista.
              </p>
            )}
          </>
        )}
        {optionsLoading ? (
          <p className="text-sm text-slate-500">Cargando roles y sucursales…</p>
        ) : (
          workspaceId && (
            <RoleAssignmentsEditor
              value={assignments}
              onChange={setAssignments}
              options={options}
              disabled={saving}
            />
          )
        )}
        {error && (
          <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {error}
            {member && (
              <Button type="button" variant="secondary" size="sm" onClick={reload}>
                Recargar datos actuales
              </Button>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={saving || optionsLoading || !workspaceId || !options.roles.length}
          >
            {saving ? 'Guardando…' : member ? 'Guardar roles' : 'Registrar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
