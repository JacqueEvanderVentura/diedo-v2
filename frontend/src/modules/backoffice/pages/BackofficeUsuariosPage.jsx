import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Search } from 'lucide-react'
import { backofficeApi } from '@/services/backofficeApi'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
} from '@/components/ui/ResponsiveList'
import { EmptyState } from '@/components/ui/EmptyState'
import { newPasswordError } from '@/lib/passwordPolicy'

const ROLE_OPTIONS = [
  { value: 'seller', label: 'Vendedor' },
  { value: 'cashier', label: 'Cajero' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'manager', label: 'Gerente' },
  { value: 'workspace_admin', label: 'Administrador' },
]

const emptyForm = () => ({
  workspaceId: '',
  displayName: '',
  email: '',
  password: '',
  roleCode: 'seller',
})

function userActive(row) {
  return row.platformStatus === 'active' && row.membershipStatus === 'active'
}

export default function BackofficeUsuariosPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const workspaceFilter = searchParams.get('workspaceId') || ''

  const [rows, setRows] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [userData, workspaceData] = await Promise.all([
        backofficeApi.listUsers({
          search: query || undefined,
          workspaceId: workspaceFilter || undefined,
          status: statusFilter || undefined,
        }),
        backofficeApi.listWorkspaces(),
      ])
      setRows(userData.items || [])
      setWorkspaces(workspaceData.items || [])
    } catch (err) {
      toast.error(err.message || 'No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }, [query, workspaceFilter, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (workspaceFilter) {
      setForm((current) => ({ ...current, workspaceId: workspaceFilter }))
    }
  }, [workspaceFilter])

  const workspaceOptions = useMemo(
    () => workspaces.map((item) => ({ value: item.workspaceId, label: item.name })),
    [workspaces],
  )

  const submitCreate = async (event) => {
    event.preventDefault()
    const passwordError = newPasswordError(form.password)
    if (passwordError) {
      toast.error(passwordError)
      return
    }
    setSaving(true)
    try {
      await backofficeApi.createUser({
        workspaceId: form.workspaceId,
        displayName: form.displayName,
        email: form.email,
        password: form.password,
        roleCode: form.roleCode,
      })
      toast.success('Usuario registrado')
      setModalOpen(false)
      setForm(emptyForm())
      load()
    } catch (err) {
      toast.error(err.message || 'No se pudo registrar el usuario.')
    } finally {
      setSaving(false)
    }
  }

  const toggleUser = async (row) => {
    const nextStatus = userActive(row) ? 'disabled' : 'active'
    try {
      await backofficeApi.updateUser(row.userId, { version: row.version, status: nextStatus })
      toast.success(nextStatus === 'disabled' ? 'Usuario inactivado' : 'Usuario reactivado')
      load()
    } catch (err) {
      toast.error(err.message || 'No se pudo actualizar el usuario.')
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6 sm:p-8" data-testid="backoffice-usuarios-page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold text-slate-900">Usuarios finales</h2>
          <p className="mt-1 text-sm text-slate-600">Cuentas de clientes en todas las compañías.</p>
        </div>
        <Button type="button" onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Registrar usuario
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, email o compañía…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select
          className="sm:w-52"
          value={workspaceFilter}
          onChange={(e) => {
            const value = e.target.value
            if (value) setSearchParams({ workspaceId: value })
            else setSearchParams({})
          }}
        >
          <option value="">Todas las compañías</option>
          {workspaceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select className="sm:w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="disabled">Inactivos</option>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin usuarios" description="No hay resultados con los filtros actuales." />
      ) : (
        <ResponsiveList>
          <ResponsiveTable>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Compañía</th>
                <th>Rol</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.membershipId}>
                  <td>
                    <div className="font-medium text-slate-900">{row.displayName}</div>
                    <div className="text-xs text-slate-500">{row.email}</div>
                  </td>
                  <td>
                    <Link
                      to={`/backoffice/companias/${row.workspaceId}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {row.workspaceName}
                    </Link>
                  </td>
                  <td className="text-sm text-slate-600">{row.roleName || '—'}</td>
                  <td>
                    <Badge tone={userActive(row) ? 'success' : 'warning'}>
                      {userActive(row) ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="text-right">
                    <Button type="button" variant="secondary" size="sm" onClick={() => toggleUser(row)}>
                      {userActive(row) ? 'Inactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
          <ResponsiveCards>
            {rows.map((row) => (
              <MobileCard key={row.membershipId}>
                <MobileCardHeader title={row.displayName} subtitle={row.email} />
                <MobileField label="Compañía" value={row.workspaceName} />
                <MobileField label="Rol" value={row.roleName || '—'} />
                <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => toggleUser(row)}>
                  {userActive(row) ? 'Inactivar' : 'Activar'}
                </Button>
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Registrar usuario" size="lg">
        <form onSubmit={submitCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">Compañía</label>
            <Select
              value={form.workspaceId}
              onChange={(e) => setForm({ ...form, workspaceId: e.target.value })}
              required
            >
              <option value="">Selecciona…</option>
              {workspaceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Nombre</label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Contraseña</label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Rol</label>
              <Select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Registrar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
