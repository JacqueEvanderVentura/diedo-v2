import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { backofficeApi } from '@/services/backofficeApi'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Pagination } from '../components/Pagination'
import { ModulePicker } from '../components/ModulePicker'
import { SubscriptionForm } from '../components/SubscriptionForm'
import { AuditPanel } from '../components/AuditPanel'
import { workspacePlanPayload } from '../backofficeForm'

import { BackofficeSelect as Select } from '../components/BackofficeSelect'

const STATUS_TONE = {
  active: 'success',
  suspended: 'warning',
  onboarding: 'neutral',
}

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
  const [memberPage, setMemberPage] = useState(1)
  const [memberPagination, setMemberPagination] = useState({ totalItems: 0, totalPages: 0 })
  const [memberLoading, setMemberLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const loadSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setError('')
    try {
      const [data, planData, moduleData] = await Promise.all([
        backofficeApi.getWorkspace(workspaceId),
        backofficeApi.listPlans(),
        backofficeApi.listModules(),
      ])
      if (sequence !== loadSequence.current) return
      setWorkspace(data)
      setPlans(planData.items || [])
      setModules(moduleData.items || [])
      setSelectedModules(data.configuredModules || data.enabledModules || [])
      setPlanCode(data.planCode || '')
    } catch (err) {
      if (sequence === loadSequence.current)
        setError(err.message || 'No se pudo cargar la compañía.')
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    setWorkspace(null)
    load()
    return () => {
      loadSequence.current += 1
    }
  }, [load])

  useEffect(() => {
    setMemberPage(1)
  }, [workspaceId])
  useEffect(() => {
    let active = true
    setMemberLoading(true)
    backofficeApi
      .listWorkspaceMembers(workspaceId, { page: memberPage, pageSize: 25 })
      .then((data) => {
        if (active) {
          setMembers(data.items || [])
          setMemberPagination(data)
        }
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setMemberLoading(false)
      })
    return () => {
      active = false
    }
  }, [workspaceId, memberPage, revision])

  const saved = (updated) => {
    setWorkspace(updated)
    setSelectedModules(updated.configuredModules || [])
    setPlanCode(updated.planCode || '')
    setRevision((n) => n + 1)
    setError('')
  }
  const saveSubscription = async () => {
    if (!workspace) return
    setSaving(true)
    try {
      const updated = await backofficeApi.updateWorkspace(
        workspaceId,
        workspacePlanPayload(workspace, planCode, selectedModules)
      )
      saved(updated)
      toast.success('Plan y módulos actualizados')
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el plan.')
    } finally {
      setSaving(false)
    }
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
      saved(updated)
      toast.success(nextStatus === 'suspended' ? 'Compañía suspendida' : 'Compañía reactivada')
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la compañía.')
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
        <Card className="p-8 text-sm text-slate-500">
          <p role="alert">{error || 'Compañía no encontrada.'}</p>
          <Button variant="secondary" className="mt-3" onClick={load}>
            Reintentar
          </Button>
        </Card>
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
            <Badge tone={STATUS_TONE[workspace.status] || 'neutral'}>
              {statusLabel(workspace.status)}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-sm text-slate-500">{workspace.slug}</p>
          {workspace.planLabel && (
            <p className="mt-1 text-sm text-slate-600">Plan: {workspace.planLabel}</p>
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

      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          {error}
          <Button variant="secondary" size="sm" className="ml-3" onClick={load}>
            Recargar datos actuales
          </Button>
        </div>
      )}
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
              <label className="mb-1 block text-sm font-medium text-slate-600">
                Plan comercial
              </label>
              <Select
                aria-label="Plan comercial"
                value={planCode}
                onChange={(e) => {
                  const code = e.target.value
                  setPlanCode(code)
                  setSelectedModules(plans.find((item) => item.code === code)?.moduleCodes || [])
                }}
              >
                <option value="" disabled>
                  Sin plan asignado
                </option>
                {workspace.planCode && !plans.some((item) => item.code === workspace.planCode) && (
                  <option value={workspace.planCode}>{workspace.planName} (archivado)</option>
                )}
                {plans.map((plan) => (
                  <option key={plan.planId} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <ModulePicker
            modules={modules}
            selected={selectedModules}
            onChange={setSelectedModules}
            disabled={saving}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            disabled={!plans.some((plan) => plan.code === planCode)}
            onClick={() =>
              setSelectedModules(plans.find((plan) => plan.code === planCode)?.moduleCodes || [])
            }
          >
            Restaurar módulos del plan
          </Button>
          <p className="mt-3 text-sm text-slate-500">
            Módulos efectivos:{' '}
            {workspace.enabledModules
              ?.map((code) => modules.find((item) => item.code === code)?.name || code)
              .join(', ') || 'Ninguno'}
            .
          </p>
          {workspace.planCustomized && (
            <p className="mt-2 text-xs text-slate-500">
              La configuración difiere del catálogo actual del plan.
            </p>
          )}
          <Button type="button" className="mt-4" disabled={saving} onClick={saveSubscription}>
            Guardar plan y módulos
          </Button>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Vigencia de la suscripción</h3>
          {workspace.subscription ? (
            <SubscriptionForm
              key={`${workspaceId}-${workspace.subscription.version}`}
              workspaceId={workspaceId}
              subscription={workspace.subscription}
              onSaved={(data) => {
                saved(data)
                toast.success('Vigencia actualizada')
              }}
              onReload={load}
            />
          ) : (
            <p className="text-sm text-slate-500">
              Sin plan asignado. Asigna un plan para gestionar su vigencia.
            </p>
          )}
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
          {memberLoading && <p className="mt-3 text-sm text-slate-500">Cargando miembros…</p>}
          <ul className="mt-4 divide-y divide-slate-100">
            {members.length === 0 ? (
              <li className="py-3 text-sm text-slate-500">Sin miembros registrados.</li>
            ) : (
              members.map((member) => (
                <li
                  key={member.membershipId}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">{member.displayName}</p>
                    <p className="text-xs text-slate-500">{member.email}</p>
                  </div>
                  <Badge tone={member.platformStatus === 'active' ? 'success' : 'warning'}>
                    {member.roleName || 'Miembro'} ·{' '}
                    {member.platformStatus === 'active' && member.membershipStatus === 'active'
                      ? 'Activo'
                      : 'Inactivo'}
                  </Badge>
                </li>
              ))
            )}
          </ul>
        </Card>

        <div className="lg:col-span-2">
          <Pagination
            page={memberPage}
            totalItems={memberPagination.totalItems}
            totalPages={memberPagination.totalPages}
            onPage={setMemberPage}
            disabled={memberLoading}
          />
        </div>
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800">Sucursales</h3>
          <ul className="mt-4 divide-y divide-slate-100">
            {(workspace.branches || []).map((branch) => (
              <li key={branch.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{branch.name}</p>
                  <p className="font-mono text-xs text-slate-500">{branch.code}</p>
                </div>
                <Badge tone={branch.status === 'active' ? 'success' : 'neutral'}>
                  {branch.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <AuditPanel workspaceId={workspaceId} revision={revision} />
    </div>
  )
}
