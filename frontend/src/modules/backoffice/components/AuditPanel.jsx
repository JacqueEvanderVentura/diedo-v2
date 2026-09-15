import { useEffect, useState } from 'react'
import { backofficeApi } from '@/services/backofficeApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BackofficeSelect as Select } from './BackofficeSelect'
import { Pagination } from './Pagination'

const actions = {
  'platform_operator.create': 'Operador de plataforma creado',
  'workspace.provision': 'Compañía creada',
  'workspace.backoffice_update': 'Compañía o módulos actualizados',
  'plan.backoffice_update': 'Plan actualizado',
  'subscription.backoffice_update': 'Suscripción actualizada',
  'user.backoffice_create': 'Acceso registrado',
  'user.backoffice_update': 'Cuenta global actualizada',
  'membership.backoffice_update': 'Acceso o roles actualizados',
}

export function AuditPanel({ workspaceId, revision = 0 }) {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actorId, setActorId] = useState('')
  const [actors, setActors] = useState([])
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [workspaces, setWorkspaces] = useState([])
  const [data, setData] = useState({ items: [], totalItems: 0, totalPages: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    if (!workspaceId)
      backofficeApi
        .listWorkspaces()
        .then((result) => {
          if (active) setWorkspaces(result.items)
        })
        .catch((err) => {
          if (active) setError(err.message)
        })
    return () => {
      active = false
    }
  }, [workspaceId])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    backofficeApi
      .listAudit({
        workspaceId: workspaceId || selectedWorkspace,
        action,
        actorId,
        dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
        page,
        pageSize: 10,
      })
      .then((result) => {
        if (!active) return
        setData(result)
        setActors((previous) => [
          ...new Map(
            [
              ...previous,
              ...result.items
                .filter((item) => item.actorPlatformUserId)
                .map((item) => ({ id: item.actorPlatformUserId, name: item.actorName })),
            ].map((item) => [item.id, item])
          ).values(),
        ])
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
  }, [workspaceId, selectedWorkspace, actorId, action, dateFrom, dateTo, page, revision, retry])
  const change = (setter, value) => {
    setter(value)
    setPage(1)
  }
  return (
    <Card className="mt-6 p-6">
      <h3 className="text-sm font-semibold text-slate-800">Actividad del Backoffice</h3>
      <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!workspaceId && (
          <label className="text-sm">
            Compañía del historial
            <Select
              value={selectedWorkspace}
              onChange={(e) => change(setSelectedWorkspace, e.target.value)}
            >
              <option value="">Todas y cambios globales</option>
              {workspaces.map((item) => (
                <option key={item.workspaceId} value={item.workspaceId}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="text-sm">
          Acción
          <Select value={action} onChange={(e) => change(setAction, e.target.value)}>
            <option value="">Todas las acciones</option>
            {Object.entries(actions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          Operador
          <Select value={actorId} onChange={(e) => change(setActorId, e.target.value)}>
            <option value="">Todos los actores</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name || actor.id}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          Desde
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => change(setDateFrom, e.target.value)}
          />
        </label>
        <label className="text-sm">
          Hasta
          <Input
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => change(setDateTo, e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <div role="alert" className="text-sm text-amber-800">
          {error}
          <Button variant="secondary" size="sm" onClick={() => setRetry((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      ) : loading ? (
        <p className="text-sm text-slate-500">Cargando actividad…</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.items.map((item) => (
            <li className="py-3 text-sm" key={item.id}>
              <p className="font-medium">{actions[item.action] || item.action}</p>
              <p className="text-slate-500">
                {new Date(item.occurredAt).toLocaleString()} ·{' '}
                {item.actorName ||
                  (item.actorType === 'api_key'
                    ? 'Integración de plataforma'
                    : item.actorType === 'administrative_cli'
                      ? 'Comando administrativo'
                      : 'Actor histórico no registrado')}
              </p>
              <details className="mt-1 text-xs text-slate-500">
                <summary className="cursor-pointer">Ver cambios</summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3">
                  {JSON.stringify(item.details, null, 2)}
                </pre>
              </details>
            </li>
          ))}
          {!data.items.length && (
            <li className="py-4 text-sm text-slate-500">No hay actividad con estos filtros.</li>
          )}
        </ul>
      )}
      <Pagination
        page={page}
        totalItems={data.totalItems}
        totalPages={data.totalPages}
        onPage={setPage}
        disabled={loading}
      />
    </Card>
  )
}
