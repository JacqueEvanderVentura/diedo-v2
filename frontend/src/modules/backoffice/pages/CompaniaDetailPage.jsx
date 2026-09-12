import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { backofficeApi } from '@/services/backofficeApi'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

import { Select } from '@/components/ui/Select'

const STATUS_TONE = {
  active: 'success',
  suspended: 'warning',
  onboarding: 'neutral',
}

const CORE_MODULES = new Set(['foundation', 'iam'])

function statusLabel(status) {
  if (status === 'active') return 'Activa'
  if (status === 'suspended') return 'Suspendida'
  return status
}

export default function CompaniaDetailPage() {
  const { workspaceId } = useParams()
  const [workspace, setWorkspace] = useState(null)
  const [plans, setPlans] = useState([])
  const [modules, setModules] = useState([])
  const [selectedModules, setSelectedModules] = useState([])
  const [planCode, setPlanCode] = useState('completo')
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, planData, moduleData, memberData] = await Promise.all([
        backofficeApi.getWorkspace(workspaceId),
        backofficeApi.listPlans(),
        backofficeApi.listModules(),
        backofficeApi.listWorkspaceMembers(workspaceId),
      ])
      setWorkspace(data)
      setPlans(planData.items || [])
      setModules(moduleData.items || [])
      setMembers(memberData.items || [])
      setSelectedModules(data.enabledModules || [])
      setPlanCode(data.planCode || 'completo')
    } catch (err) {
      toast.error(err.message || 'No se pudo cargar la compañía.')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  const saveSubscription = async () => {
    if (!workspace) return
    setSaving(true)
    try {
      const updated = await backofficeApi.updateWorkspace(workspaceId, {
        version: workspace.version,
        planCode,
        enabledModules: selectedModules,
      })
      setWorkspace(updated)
      setSelectedModules(updated.enabledModules || [])
      setPlanCode(updated.planCode || planCode)
      toast.success('Plan y módulos actualizados')
    } catch (err) {
      toast.error(err.message || 'No se pudo actualizar la suscripción.')
    } finally {
      setSaving(false)
    }
  }

  const toggleModule = (code) => {
    if (CORE_MODULES.has(code)) return
    setSelectedModules((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code].sort(),
    )
  }

  const toggleStatus = async () => {
    if (!workspace) return
    const nextStatus = workspace.status === 'active' ? 'suspended' : 'active'
    setSaving(true)
    try {
      const updated = await backofficeApi.updateWorkspace(workspaceId, {
        version: workspace.version,
        status: nextStatus,
      })
      setWorkspace(updated)
      toast.success(nextStatus === 'suspended' ? 'Compañía suspendida' : 'Compañía reactivada')
    } catch (err) {
      toast.error(err.message || 'No se pudo actualizar la compañía.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] p-6 sm:p-8">
        <Card className="p-8 text-sm text-slate-500">Cargando ficha…</Card>
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="mx-auto max-w-[1400px] p-6 sm:p-8">
        <Card className="p-8 text-sm text-slate-500">Compañía no encontrada.</Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6 sm:p-8" data-testid="backoffice-compania-detail">
      <Link
        to="/backoffice/companias"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a compañías
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-heading text-xl font-semibold text-slate-900">{workspace.name}</h2>
            <Badge tone={STATUS_TONE[workspace.status] || 'neutral'}>{statusLabel(workspace.status)}</Badge>
          </div>
          <p className="mt-1 font-mono text-sm text-slate-500">{workspace.slug}</p>
          {workspace.planLabel && (
            <p className="mt-1 text-sm text-slate-600">
              Plan: {workspace.planLabel}
              {workspace.planCustomized ? ' · personalizado' : ''}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant={workspace.status === 'active' ? 'danger' : 'primary'}
          disabled={saving}
          onClick={toggleStatus}
          data-testid="companias-toggle-status"
        >
          {workspace.status === 'active' ? 'Suspender compañía' : 'Reactivar compañía'}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-800">Datos generales</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Moneda</dt>
              <dd className="font-medium text-slate-900">{workspace.defaultCurrency}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Zona horaria</dt>
              <dd className="font-medium text-slate-900">{workspace.timezone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Locale</dt>
              <dd className="font-medium text-slate-900">{workspace.locale}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-800">Owner</h3>
          {workspace.owner ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Nombre</dt>
                <dd className="font-medium text-slate-900">{workspace.owner.displayName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-900">{workspace.owner.email}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Sin administrador identificado.</p>
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">Plan y módulos</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Plan comercial</label>
              <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
                {plans.map((plan) => (
                  <option key={plan.planId} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {modules.map((module) => {
              const selected = selectedModules.includes(module.code)
              const locked = CORE_MODULES.has(module.code)
              return (
                <button
                  key={module.code}
                  type="button"
                  disabled={locked}
                  onClick={() => toggleModule(module.code)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                  } ${locked ? 'opacity-70' : ''}`}
                >
                  {module.name}
                </button>
              )
            })}
          </div>
          <Button type="button" className="mt-4" disabled={saving} onClick={saveSubscription}>
            Guardar plan y módulos
          </Button>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-800">Miembros</h3>
            <Link
              to={`/backoffice/usuarios?workspaceId=${workspaceId}`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Gestionar usuarios
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-slate-100">
            {members.length === 0 ? (
              <li className="py-3 text-sm text-slate-500">Sin miembros registrados.</li>
            ) : (
              members.map((member) => (
                <li key={member.membershipId} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{member.displayName}</p>
                    <p className="text-xs text-slate-500">{member.email}</p>
                  </div>
                  <Badge tone={member.platformStatus === 'active' ? 'success' : 'warning'}>
                    {member.roleName || member.platformStatus}
                  </Badge>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">Sucursales</h3>
          <ul className="mt-4 divide-y divide-slate-100">
            {(workspace.branches || []).map((branch) => (
              <li key={branch.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{branch.name}</p>
                  <p className="font-mono text-xs text-slate-500">{branch.code}</p>
                </div>
                <Badge tone={branch.status === 'active' ? 'success' : 'neutral'}>{branch.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
