import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { backofficeApi } from '@/services/backofficeApi'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import { BackofficeSelect as Select } from '../components/BackofficeSelect'
import { Pagination } from '../components/Pagination'
import { MemberFormModal } from '../components/MemberFormModal'
import { positivePage } from '../backofficeForm'

export default function BackofficeUsuariosPage() {
  const [params, setParams] = useSearchParams()
  const workspaceId = params.get('workspaceId') || ''
  const search = params.get('search') || ''
  const status = params.get('status') || ''
  const platformStatus = params.get('platformStatus') || ''
  const page = positivePage(params.get('page'))
  const pageSize = [25, 50, 100].includes(Number(params.get('pageSize')))
    ? Number(params.get('pageSize'))
    : 25
  const [data, setData] = useState({ items: [], totalItems: 0, totalPages: 0, totalUsers: 0 })
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)
  const [globalAction, setGlobalAction] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    backofficeApi
      .listWorkspaces()
      .then((result) => {
        if (active) setWorkspaces(result.items || [])
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    backofficeApi
      .listUsers({ workspaceId, search, status, platformStatus, page, pageSize })
      .then((result) => {
        if (active) setData(result)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [workspaceId, search, status, platformStatus, page, pageSize, revision])

  const filter = (key, value) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, String(value))
      else next.delete(key)
      if (key !== 'page') next.delete('page')
      return next
    })
  const reload = () => setRevision((value) => value + 1)
  const toggleMembership = async (row) => {
    setSaving(true)
    try {
      await backofficeApi.updateMember(row.workspaceId, row.membershipId, {
        version: row.membershipVersion,
        status: row.membershipStatus === 'active' ? 'suspended' : 'active',
      })
      toast.success('Acceso a la compañía actualizado')
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  const toggleGlobal = async () => {
    setSaving(true)
    try {
      await backofficeApi.updateUser(globalAction.userId, {
        version: globalAction.version,
        status: globalAction.platformStatus === 'active' ? 'disabled' : 'active',
      })
      setGlobalAction(null)
      toast.success('Cuenta global actualizada')
      reload()
    } catch (err) {
      setGlobalAction(null)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6 sm:p-8" data-testid="backoffice-usuarios-page">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold text-slate-900">Usuarios finales</h2>
          <p className="mt-1 text-sm text-slate-600">
            Cada fila representa el acceso de una cuenta a una compañía.
          </p>
        </div>
        <Button onClick={() => setForm({})}>Registrar usuario</Button>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <label className="text-sm">
          Buscar
          <Input
            value={search}
            placeholder="Nombre, email o compañía"
            onChange={(e) => filter('search', e.target.value)}
          />
        </label>
        <label className="text-sm">
          Compañía
          <Select value={workspaceId} onChange={(e) => filter('workspaceId', e.target.value)}>
            <option value="">Todas las compañías</option>
            {workspaces.map((item) => (
              <option key={item.workspaceId} value={item.workspaceId}>
                {item.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          Cuenta global
          <Select value={platformStatus} onChange={(e) => filter('platformStatus', e.target.value)}>
            <option value="">Todas las cuentas</option>
            <option value="active">Activas</option>
            <option value="disabled">Deshabilitadas</option>
          </Select>
        </label>
        <label className="text-sm">
          Acceso del usuario
          <Select value={status} onChange={(e) => filter('status', e.target.value)}>
            <option value="">Todos los accesos</option>
            <option value="active">Activos</option>
            <option value="disabled">Inactivos</option>
          </Select>
        </label>
      </div>
      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          {error}
          <Button variant="secondary" size="sm" className="ml-3" onClick={reload}>
            Recargar datos actuales
          </Button>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Cargando usuarios…</p>
      ) : (
        !error && (
          <>
            <p className="mb-3 text-sm text-slate-500">
              {data.totalUsers} cuentas distintas · {data.totalItems} accesos
            </p>
            <Card className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {[
                      'Usuario',
                      'Compañía',
                      'Roles',
                      'Cuenta global',
                      'Acceso a compañía',
                      'Acciones',
                    ].map((label) => (
                      <th className="p-3" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.membershipId} className="border-t border-slate-100">
                      <td className="p-3">
                        <p className="font-medium">{row.displayName}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="p-3">
                        <Link
                          className="text-blue-600"
                          to={`/backoffice/companias/${row.workspaceId}`}
                        >
                          {row.workspaceName}
                        </Link>
                      </td>
                      <td className="p-3">
                        {[...new Set(row.roleAssignments?.map((item) => item.roleName))].join(
                          ', '
                        ) ||
                          row.roleName ||
                          '—'}
                      </td>
                      <td className="p-3">
                        <Badge tone={row.platformStatus === 'active' ? 'success' : 'warning'}>
                          {row.platformStatus === 'active' ? 'Activa' : 'Deshabilitada'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge tone={row.membershipStatus === 'active' ? 'success' : 'warning'}>
                          {{
                            active: 'Activo',
                            suspended: 'Suspendido',
                            invited: 'Invitado',
                            revoked: 'Revocado',
                            expired: 'Expirado',
                          }[row.membershipStatus] || row.membershipStatus}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {['active', 'suspended'].includes(row.membershipStatus) && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={saving}
                                onClick={() => toggleMembership(row)}
                              >
                                {row.membershipStatus === 'active'
                                  ? 'Suspender acceso'
                                  : 'Reactivar acceso'}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setForm({ member: row })}
                              >
                                Editar roles
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={saving}
                            onClick={() => setGlobalAction(row)}
                          >
                            {row.platformStatus === 'active'
                              ? 'Deshabilitar cuenta global'
                              : 'Activar cuenta global'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.items.length && (
                <p className="p-6 text-sm text-slate-500">No hay usuarios con estos filtros.</p>
              )}
            </Card>
            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={data.totalItems}
              totalPages={data.totalPages}
              onPage={(value) => filter('page', value)}
              onPageSize={(value) => filter('pageSize', value)}
            />
          </>
        )
      )}
      {form && (
        <MemberFormModal
          member={form.member}
          workspaceId={workspaceId}
          workspaces={workspaces}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            reload()
          }}
        />
      )}
      <Modal
        open={!!globalAction}
        onClose={() => !saving && setGlobalAction(null)}
        title="Cambiar cuenta global"
      >
        <p className="text-sm text-slate-600">
          Esta acción cambia la cuenta de <strong>{globalAction?.displayName}</strong> en todas sus
          compañías. Al deshabilitarla se cierran sus sesiones. Activarla conserva los accesos que
          estaban suspendidos.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={() => setGlobalAction(null)}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={toggleGlobal}>
            {saving ? 'Guardando…' : 'Confirmar cambio global'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
