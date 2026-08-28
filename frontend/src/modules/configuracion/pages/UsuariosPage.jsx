import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Shield, Search } from 'lucide-react'
import { useConfigStore, USER_ROLES } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { usersApi } from '@/services/usersApi'
import { mapUserFromApi, mapUserSummary } from '@/services/adapters/iam'
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
const EMPTY = { name: '', email: '', password: '', role: 'Vendedor', roleId: '', active: true, branchIds: [] }

export default function UsuariosPage({ embedded = false }) {
  const isOnline = useSessionStore((s) => s.isOnline())
  const localUsers = useConfigStore((s) => s.users)
  const localBranches = useConfigStore((s) => s.branches)
  const addUser = useConfigStore((s) => s.addUser)
  const updateUser = useConfigStore((s) => s.updateUser)
  const deleteUser = useConfigStore((s) => s.deleteUser)

  const [apiUsers, setApiUsers] = useState([])
  const [apiStats, setApiStats] = useState(null)
  const [formOptions, setFormOptions] = useState(null)
  const [loading, setLoading] = useState(false)

  const users = isOnline ? apiUsers : localUsers
  const branches = isOnline && formOptions?.branches?.length
    ? formOptions.branches.map((b) => ({ id: b.id, name: b.name }))
    : localBranches

  const loadApiData = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, summary, options] = await Promise.all([
        usersApi.list({ pageSize: 100, sortBy: 'displayName' }),
        usersApi.summary(),
        usersApi.formOptions(),
      ])
      setApiUsers((listRes.items || []).map(mapUserFromApi))
      setApiStats(mapUserSummary(summary))
      setFormOptions(options)
    } catch (err) {
      toast.error(err.message || 'No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOnline) loadApiData()
  }, [isOnline, loadApiData])

  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (modalOpen) {
      setForm(editing ? { ...EMPTY, ...editing, password: '' } : EMPTY)
      setErr('')
    }
  }, [modalOpen, editing])

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
      role: (u) => u.role || '',
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
    if (!form.name.trim()) return setErr('Ingresa el nombre.')
    if (!form.email.trim()) return setErr('Ingresa el email.')
    if (!editing && (!form.password || form.password.length < (isOnline ? 12 : 6))) {
      return setErr(isOnline ? 'La contraseña debe tener al menos 12 caracteres.' : 'La contraseña debe tener al menos 6 caracteres.')
    }

    if (isOnline) {
      if (editing) return setErr('La edición de usuarios aún no está disponible en la API.')
      if (!form.roleId) return setErr('Selecciona un rol.')
      if (!form.branchIds.length) return setErr('Selecciona al menos una sucursal.')
      try {
        await usersApi.create({
          displayName: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          roleId: form.roleId,
          branchIds: form.branchIds,
        })
        toast.success('Usuario creado')
        setModalOpen(false)
        loadApiData()
      } catch (e) {
        setErr(e.message || 'No se pudo crear el usuario.')
      }
      return
    }

    const { password, roleId, ...data } = form
    if (editing) {
      updateUser(editing.id, data)
      toast.success('Usuario actualizado')
    } else {
      addUser({ ...data, password })
      toast.success('Usuario creado')
    }
    setModalOpen(false)
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
        <Button onClick={() => { setEditing(null); setModalOpen(true) }} data-testid="usuario-new-btn"><Plus className="h-4 w-4" /> Nuevo Usuario</Button>
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
                    <td className="px-6 py-4"><Badge tone={ROLE_TONE[u.role] || 'neutral'}>{u.role}</Badge></td>
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
                        <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                      ) : (
                        <button onClick={() => updateUser(u.id, { active: !u.active })}><Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Inactivo'}</Badge></button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        {!isOnline && (
                          <>
                            <button onClick={() => { setEditing(u); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => { deleteUser(u.id); toast.success('Usuario eliminado') }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
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
                      <Badge tone={ROLE_TONE[u.role] || 'neutral'}>{u.role}</Badge>
                      {!isOnline ? (
                        <button onClick={() => updateUser(u.id, { active: !u.active })}>
                          <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                        </button>
                      ) : (
                        <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Activo' : 'Inactivo'}</Badge>
                      )}
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
                {!isOnline && (
                  <MobileCardFooter>
                    <span />
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(u); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => { deleteUser(u.id); toast.success('Usuario eliminado') }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </MobileCardFooter>
                )}
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Usuario' : 'Nuevo Usuario'} wide testId="usuario-modal">
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre Completo *</label><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre del usuario" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Email *</label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="email@ejemplo.com" /></div>
          {!editing && <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Contraseña *</label><Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={isOnline ? 'Mínimo 12 caracteres' : 'Mínimo 6 caracteres'} /></div>}
          <div>
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
          </div>
          {err && <p className="text-sm text-red-500">{err}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={submit}>{editing ? 'Guardar' : 'Crear Usuario'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
