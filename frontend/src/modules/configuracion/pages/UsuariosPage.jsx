import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { KeyRound, MailPlus, Pencil, Plus, Search, Shield, Trash2 } from 'lucide-react'
import { useConfigStore, USER_ROLES } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { usersApi } from '@/services/usersApi'
import {
  mapUserFromApi,
  mapUserSummary,
  normalizeRoleAssignments,
  roleAssignmentsToPayload,
  validateRoleAssignments,
} from '@/services/adapters/iam'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardFooter,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { matchesBranch, buildBranchFilterOptions } from '@/lib/branches'
import { configPageClass } from '../lib/pageShell'
import { cn } from '@/lib/utils'

const ROLE_TONE = { Administrador: 'brand', Gerente: 'success', Supervisor: 'warning', Cajero: 'neutral', Vendedor: 'neutral' }
const SCOPE_OPTIONS = [
  { value: 'workspace', label: 'Workspace completo (global)' },
  { value: 'legalEntity', label: 'Entidad legal específica' },
  { value: 'branch', label: 'Sucursal específica' },
]

let assignmentSequence = 0

const emptyRoleAssignment = () => ({
  clientId: `role-assignment-${++assignmentSequence}`,
  roleId: '',
  roleName: '',
  scopeType: 'branch',
  legalEntityId: '',
  branchId: '',
})

const emptyForm = () => ({
  name: '',
  email: '',
  password: '',
  role: 'Vendedor',
  roleId: '',
  active: true,
  branchIds: [],
  roleAssignments: [emptyRoleAssignment()],
})

function RoleAssignmentSummary({ user, mobile = false }) {
  const assignments = user.roleAssignments || []
  const labels = user.roleAssignmentLabels || [user.role || 'Sin asignaciones']
  return (
    <div className={cn('flex flex-wrap gap-1', mobile && 'justify-end')} data-testid={`usuario-role-scopes-${mobile ? 'mobile' : 'table'}-${user.id}`}>
      {labels.map((label, index) => (
        <Badge key={`${user.id}-role-${index}`} tone={ROLE_TONE[assignments[index]?.roleName || user.role] || 'neutral'}>
          {label}
        </Badge>
      ))}
    </div>
  )
}

function RoleAssignmentsEditor({ assignments, options, onChange, disabled }) {
  const roles = options?.roles || []
  const legalEntities = options?.legalEntities || []
  const branches = options?.branches || []
  const workspaceOnlyRoleIds = useMemo(
    () => new Set(roles.filter((role) => role.code === 'workspace_admin').map((role) => role.id)),
    [roles]
  )

  const update = (index, patch) => {
    onChange(assignments.map((assignment, row) => (row === index ? { ...assignment, ...patch } : assignment)))
  }

  const changeScope = (index, scopeType) => {
    update(index, { scopeType, legalEntityId: '', branchId: '' })
  }

  const remove = (index) => {
    if (assignments.length === 1) return
    onChange(assignments.filter((_, row) => row !== index))
  }

  return (
    <div className="space-y-3" data-testid="usuario-role-assignments">
      <div>
        <p className="text-sm font-medium text-slate-600">Roles y alcances *</p>
        <p className="mt-1 text-xs text-slate-400">
          Cada fila es una asignación independiente. El alcance global debe elegirse explícitamente.
        </p>
      </div>

      {assignments.map((assignment, index) => (
        <div key={assignment.id || assignment.clientId} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3" data-testid={`usuario-assignment-${index}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Asignación {index + 1}</span>
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={disabled || assignments.length === 1}
              aria-label={`Quitar asignación ${index + 1}`}
              data-testid={`usuario-assignment-remove-${index}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">Rol</label>
              <Select
                value={assignment.roleId}
                onChange={(roleId) => {
                  const role = roles.find((item) => item.id === roleId)
                  update(index, {
                    roleId,
                    roleCode: role?.code || '',
                    roleName: role?.name || '',
                    ...(role?.code === 'workspace_admin'
                      ? { scopeType: 'workspace', legalEntityId: '', branchId: '' }
                      : {}),
                  })
                }}
                options={roles}
                disabled={disabled}
                data-testid={`usuario-assignment-role-${index}`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">Alcance</label>
              <Select
                value={assignment.scopeType}
                onChange={(scopeType) => changeScope(index, scopeType)}
                options={SCOPE_OPTIONS}
                disabled={disabled || workspaceOnlyRoleIds.has(assignment.roleId)}
                data-testid={`usuario-assignment-scope-${index}`}
              />
              {workspaceOnlyRoleIds.has(assignment.roleId) && (
                <p className="mt-1.5 text-xs text-slate-400" data-testid={`usuario-assignment-workspace-only-${index}`}>
                  Administrador siempre administra todo el workspace.
                </p>
              )}
            </div>
            {assignment.scopeType === 'legalEntity' && (
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Entidad legal</label>
                <Select
                  value={assignment.legalEntityId}
                  onChange={(legalEntityId) => update(index, { legalEntityId })}
                  options={legalEntities}
                  disabled={disabled}
                  data-testid={`usuario-assignment-target-${index}`}
                />
              </div>
            )}
            {assignment.scopeType === 'branch' && (
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">Sucursal</label>
                <Select
                  value={assignment.branchId}
                  onChange={(branchId) => update(index, { branchId })}
                  options={branches}
                  disabled={disabled}
                  data-testid={`usuario-assignment-target-${index}`}
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...assignments, emptyRoleAssignment()])}
        disabled={disabled}
        data-testid="usuario-assignment-add"
      >
        <Plus className="h-4 w-4" /> Agregar asignación
      </Button>
    </div>
  )
}

export default function UsuariosPage({ embedded = false }) {
  const isOnline = useSessionStore((s) => s.isOnline())
  const canManageMemberships = useSessionStore((s) => s.hasPermission('membership.manage'))
  const localUsers = useConfigStore((s) => s.users)
  const localBranches = useConfigStore((s) => s.branches)
  const addUser = useConfigStore((s) => s.addUser)
  const updateUser = useConfigStore((s) => s.updateUser)
  const deleteUser = useConfigStore((s) => s.deleteUser)

  const [apiUsers, setApiUsers] = useState([])
  const [apiStats, setApiStats] = useState(null)
  const [formOptions, setFormOptions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)

  const users = isOnline ? apiUsers : localUsers
  const apiBranches = useMemo(() => {
    const source = formOptions?.branches?.length
      ? formOptions.branches
      : apiUsers.flatMap((user) => user.branchIds.map((id, index) => ({ id, name: user.branchLabels[index] || id })))
    return Array.from(new Map(source.map((branch) => [branch.id, { id: branch.id, name: branch.name }])).values())
  }, [apiUsers, formOptions])
  const branches = isOnline ? apiBranches : localBranches

  const loadApiData = useCallback(async ({ notifyError = true } = {}) => {
    setLoading(true)
    try {
      const optionsRequest = canManageMemberships
        ? usersApi.formOptions().then((data) => ({ data })).catch((error) => ({ error }))
        : Promise.resolve({ data: null })
      const [listRes, summary, optionsResult] = await Promise.all([
        usersApi.list({ pageSize: 100, sortBy: 'displayName' }),
        usersApi.summary(),
        optionsRequest,
      ])
      const options = optionsResult.data || null
      setApiUsers((listRes.items || []).map((item) => mapUserFromApi(item, options || { branches: item.branches || [] })))
      setApiStats(mapUserSummary(summary))
      setFormOptions(options)
      if (optionsResult.error && notifyError) {
        toast.error(optionsResult.error.message || 'No se pudieron cargar las opciones del editor de usuarios.')
      }
      return true
    } catch (err) {
      if (notifyError) toast.error(err.message || 'No se pudieron cargar los usuarios.')
      return false
    } finally {
      setLoading(false)
    }
  }, [canManageMemberships])

  useEffect(() => {
    if (isOnline) loadApiData()
  }, [isOnline, loadApiData])

  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteMode, setInviteMode] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(() => emptyForm())
  const [err, setErr] = useState('')

  useEffect(() => {
    if (modalOpen) {
      const initial = emptyForm()
      if (editing) {
        const assignments = normalizeRoleAssignments(editing.roleAssignments)
        setForm({
          ...initial,
          ...editing,
          password: '',
          roleAssignments: assignments.length ? assignments : [emptyRoleAssignment()],
        })
      } else {
        setForm(initial)
      }
      setErr('')
    }
  }, [modalOpen, editing, isOnline])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const stats = useMemo(() => {
    if (isOnline && apiStats) return apiStats
    return {
      total: users.length,
      activos: users.filter((u) => u.active).length,
      admins: users.filter((u) => u.role === 'Administrador').length,
      inactivos: users.filter((u) => !u.active).length,
    }
  }, [users, isOnline, apiStats])

  const listFiltered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (!matchesBranch(u, branchFilter)) return false
      return !q || u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    })
  }, [users, query, branchFilter])

  const branchLabel = (ids, labels) => {
    if (labels?.length) return labels.join(', ')
    return (ids || []).map((bid) => branches.find((b) => b.id === bid)?.name || bid).join(', ')
  }

  const { rows: list, sortKey, sortDir, toggleSort } = useSortedRows(listFiltered, {
    defaultSort: { key: 'name', dir: 'asc' },
    accessors: {
      name: (u) => u.name,
      role: (u) => u.roleAssignmentLabels?.join(' ') || u.role || '',
      branches: (u) => branchLabel(u.branchIds, u.branchLabels),
      lastAccess: (u) => u.lastAccess || '',
      status: (u) => (u.active ? 1 : 0),
    },
  })

  const roleOptions = isOnline && formOptions?.roles?.length
    ? formOptions.roles
    : USER_ROLES.map((name) => ({ id: name, name }))

  const toggleBranch = (id) => {
    setForm((f) => ({
      ...f,
      branchIds: f.branchIds.includes(id) ? f.branchIds.filter((b) => b !== id) : [...f.branchIds, id],
    }))
  }

  const submit = async () => {
    if (submitting) return
    setErr('')
    if (!form.name.trim()) return setErr('Ingresa el nombre.')
    if (!form.email.trim()) return setErr('Ingresa el email.')
    if (!editing && !inviteMode && (!form.password || form.password.length < (isOnline ? 12 : 6))) {
      return setErr(isOnline ? 'La contraseña debe tener al menos 12 caracteres.' : 'La contraseña debe tener al menos 6 caracteres.')
    }

    if (isOnline) {
      if (!canManageMemberships) return setErr('No tienes permiso para gestionar usuarios.')
      const assignmentError = validateRoleAssignments(form.roleAssignments, formOptions?.roles)
      if (assignmentError) return setErr(assignmentError)
      const roleAssignments = roleAssignmentsToPayload(form.roleAssignments)
      setSubmitting(true)
      try {
        let successMessage
        if (editing) {
          await usersApi.update(editing.id, {
            roleAssignments,
            status: form.active ? 'active' : 'suspended',
            version: editing.version,
          })
          successMessage = 'Usuario actualizado'
        } else if (inviteMode) {
          const invitation = await usersApi.invite({
            displayName: form.name.trim(),
            email: form.email.trim(),
            roleAssignments,
          })
          let copied = false
          if (invitation.acceptToken && navigator.clipboard) {
            try {
              await navigator.clipboard.writeText(invitation.acceptToken)
              copied = true
            } catch {
              // La invitación ya fue creada; un fallo del portapapeles no debe reenviarla.
            }
          }
          successMessage = copied ? 'Invitación creada; token copiado al portapapeles' : 'Invitación creada'
        } else {
          await usersApi.create({
            displayName: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            roleAssignments,
          })
          successMessage = 'Usuario creado'
        }
        setModalOpen(false)
        toast.success(successMessage)
        await loadApiData()
      } catch (e) {
        setErr(e.message || 'No se pudo crear el usuario.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    const { password, roleId, roleAssignments, ...data } = form
    if (editing) {
      updateUser(editing.id, data)
      toast.success('Usuario actualizado')
    } else {
      addUser({ ...data, password })
      toast.success('Usuario creado')
    }
    setModalOpen(false)
  }

  const toggleOnlineStatus = async (user) => {
    if (!canManageMemberships || pendingAction) return
    setPendingAction(`status:${user.id}`)
    try {
      await usersApi.update(user.id, {
        status: user.active ? 'suspended' : 'active',
        version: user.version,
      })
      toast.success(user.active ? 'Usuario suspendido' : 'Usuario reactivado')
      await loadApiData()
    } catch (error) {
      toast.error(error.message || 'No se pudo cambiar el estado del usuario.')
    } finally {
      setPendingAction(null)
    }
  }

  const resetOnlinePassword = async (user) => {
    if (!canManageMemberships || pendingAction) return
    const password = window.prompt(`Nueva contraseña temporal para ${user.name} (mínimo 12 caracteres):`)
    if (password === null) return
    if (password.length < 12) return toast.error('La contraseña debe tener al menos 12 caracteres.')
    setPendingAction(`password:${user.id}`)
    try {
      await usersApi.resetPassword(user.id, password)
      const reloaded = await loadApiData()
      if (!reloaded) {
        toast.error('La contraseña cambió, pero no se pudo refrescar la versión del usuario. Recarga antes de editarlo.')
        return
      }
      toast.success('Contraseña restablecida y sesiones revocadas')
    } catch (error) {
      toast.error(error.message || 'No se pudo restablecer la contraseña.')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className={configPageClass(embedded)} data-testid="usuarios-page">
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-700">
        <Shield className="h-4 w-4 shrink-0" />
        Gestiona roles aquí y define permisos granulares en{' '}
        <Link
          to={embedded ? '/configuracion?open=permisos' : '/configuracion/permisos'}
          className="font-semibold underline"
        >
          Permisos
        </Link>
        .
        {isOnline && !canManageMemberships && (
          <span className="ml-2 text-xs font-semibold text-slate-500">Modo consulta</span>
        )}
        {isOnline && <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">API</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Total Usuarios</p><p className="mt-1 font-heading text-2xl font-bold">{stats.total}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Activos</p><p className="mt-1 font-heading text-2xl font-bold text-emerald-600">{stats.activos}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Administradores</p><p className="mt-1 font-heading text-2xl font-bold">{stats.admins}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Inactivos</p><p className="mt-1 font-heading text-2xl font-bold text-slate-400">{stats.inactivos}</p></Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar usuarios..." className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600" />
          </div>
          <Select value={branchFilter} onChange={setBranchFilter} options={buildBranchFilterOptions(branches)} size="sm" className="min-w-[180px]" data-testid="usuarios-branch-filter" />
        </div>
        {(!isOnline || canManageMemberships) && (
          <div className="flex gap-2">
            {isOnline && (
              <Button
                variant="secondary"
                onClick={() => { setInviteMode(true); setEditing(null); setModalOpen(true) }}
                disabled={loading || !formOptions}
                data-testid="usuario-invite-btn"
              >
                <MailPlus className="h-4 w-4" /> Invitar
              </Button>
            )}
            <Button
              onClick={() => { setInviteMode(false); setEditing(null); setModalOpen(true) }}
              disabled={isOnline && (loading || !formOptions)}
              data-testid="usuario-new-btn"
            >
              <Plus className="h-4 w-4" /> Nuevo Usuario
            </Button>
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-slate-400">Cargando usuarios…</p>}

      <Card className="overflow-hidden" data-testid="usuarios-table">
        <ResponsiveList minTableWidth={900} columnCount={6}>
          <ResponsiveTable testId="usuarios-table" wrapCard={false}>
            <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <SortableTh column="name" className="px-6 py-4">Usuario</SortableTh>
                  <SortableTh column="role" className="px-6 py-4">Rol</SortableTh>
                  <SortableTh column="branches" className="px-6 py-4">Sucursales</SortableTh>
                  <SortableTh column="lastAccess" className="px-6 py-4">Último Acceso</SortableTh>
                  <SortableTh column="status" className="px-6 py-4">Estado</SortableTh>
                  <SortableTh sortable={false} align="right" className="px-6 py-4">Acciones</SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {list.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60" data-testid={`usuario-row-${u.id}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{u.initials || u.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
                        <div><p className="font-semibold text-slate-800">{u.name}</p><p className="text-xs text-slate-400">{u.email}</p></div>
                      </div>
                    </td>
                    <td className="px-6 py-4"><RoleAssignmentSummary user={u} /></td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(u.branchLabels || u.branchIds || []).map((bid, i) => (
                          <span key={`${u.id}-${i}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {u.branchLabels ? bid : branches.find((b) => b.id === bid)?.name || bid}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400">{u.lastAccess || '—'}</td>
                    <td className="px-6 py-4">
                      {isOnline ? (
                        canManageMemberships ? (
                          <button
                            onClick={() => toggleOnlineStatus(u)}
                            disabled={Boolean(pendingAction)}
                            data-testid={`usuario-status-${u.id}`}
                          >
                            <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Suspendido'}</Badge>
                          </button>
                        ) : <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Suspendido'}</Badge>
                      ) : (
                        <button onClick={() => updateUser(u.id, { active: !u.active })}><Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Inactivo'}</Badge></button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        {(!isOnline || canManageMemberships) && (
                          <button
                            onClick={() => { setInviteMode(false); setEditing(u); setModalOpen(true) }}
                            disabled={Boolean(pendingAction)}
                            aria-label={`Editar ${u.name}`}
                            data-testid={`usuario-edit-${u.id}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {isOnline ? (
                          canManageMemberships && (
                            <button
                              title="Restablecer contraseña"
                              aria-label={`Restablecer contraseña de ${u.name}`}
                              onClick={() => resetOnlinePassword(u)}
                              disabled={Boolean(pendingAction)}
                              data-testid={`usuario-password-${u.id}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                          )
                        ) : <button onClick={() => { deleteUser(u.id); toast.success('Usuario eliminado') }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="usuarios-cards" className="p-4">
            {list.map((u) => (
              <MobileCard key={u.id} testId={`usuario-card-${u.id}`}>
                <MobileCardHeader
                  title={u.name}
                  subtitle={u.email}
                  badge={
                    <div className="flex flex-wrap justify-end gap-1">
                      <RoleAssignmentSummary user={u} mobile />
                      {!isOnline ? (
                        <button onClick={() => updateUser(u.id, { active: !u.active })}>
                          <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                        </button>
                      ) : canManageMemberships ? (
                        <button onClick={() => toggleOnlineStatus(u)} disabled={Boolean(pendingAction)}>
                          <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Suspendido'}</Badge>
                        </button>
                      ) : <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Suspendido'}</Badge>}
                    </div>
                  }
                />
                <MobileCardGrid>
                  <MobileField label="Sucursales" fullWidth>
                    <div className="flex flex-wrap gap-1">
                      {(u.branchLabels || u.branchIds || []).map((bid, i) => (
                        <span key={`${u.id}-m-${i}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {u.branchLabels ? bid : branches.find((b) => b.id === bid)?.name || bid}
                        </span>
                      ))}
                    </div>
                  </MobileField>
                  <MobileField label="Último acceso">{u.lastAccess || '—'}</MobileField>
                </MobileCardGrid>
                {(!isOnline || canManageMemberships) && <MobileCardFooter>
                    <span />
                    <div className="flex gap-1">
                      <button onClick={() => { setInviteMode(false); setEditing(u); setModalOpen(true) }} disabled={Boolean(pendingAction)} aria-label={`Editar ${u.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"><Pencil className="h-4 w-4" /></button>
                      {isOnline ? <button onClick={() => resetOnlinePassword(u)} disabled={Boolean(pendingAction)} aria-label={`Restablecer contraseña de ${u.name}`}><KeyRound className="h-4 w-4" /></button> : <button onClick={() => { deleteUser(u.id); toast.success('Usuario eliminado') }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                </MobileCardFooter>}
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
      </Card>

      <Modal open={modalOpen} onClose={() => { if (!submitting) setModalOpen(false) }} title={editing ? 'Editar Usuario' : inviteMode ? 'Invitar Usuario' : 'Nuevo Usuario'} wide testId="usuario-modal">
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre Completo *</label><Input value={form.name} disabled={submitting || Boolean(editing && isOnline)} onChange={(e) => set('name', e.target.value)} placeholder="Nombre del usuario" data-testid="usuario-name" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Email *</label><Input type="email" value={form.email} disabled={submitting || Boolean(editing && isOnline)} onChange={(e) => set('email', e.target.value)} placeholder="email@ejemplo.com" data-testid="usuario-email" /></div>
          {!editing && !inviteMode && <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Contraseña *</label><Input type="password" value={form.password} disabled={submitting} onChange={(e) => set('password', e.target.value)} placeholder={isOnline ? 'Mínimo 12 caracteres' : 'Mínimo 6 caracteres'} data-testid="usuario-password-input" /></div>}
          {isOnline ? (
            <RoleAssignmentsEditor
              assignments={form.roleAssignments}
              options={formOptions}
              onChange={(roleAssignments) => set('roleAssignments', roleAssignments)}
              disabled={submitting}
            />
          ) : <><div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Rol</label>
            <div className="flex flex-wrap gap-2">
              {roleOptions.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    set('role', r.name)
                    set('roleId', isOnline ? r.id : r.name)
                  }}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold', (isOnline ? form.roleId === r.id : form.role === r.name) ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500')}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursales Permitidas</label>
            <p className="mb-2 text-xs text-slate-400">El usuario podrá ver y gestionar datos únicamente de las sucursales seleccionadas.</p>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-100 p-3">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} className="rounded border-slate-300" />
                  {b.name}
                </label>
              ))}
            </div>
          </div></>}
          {err && <p className="text-sm text-red-500" data-testid="usuario-form-error">{err}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button className="flex-1" onClick={submit} disabled={submitting} data-testid="usuario-submit">
              {submitting ? 'Guardando…' : editing ? 'Guardar' : inviteMode ? 'Crear invitación' : 'Crear Usuario'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
