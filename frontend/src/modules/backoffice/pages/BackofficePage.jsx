import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Building2, Users, Layers } from 'lucide-react'
import { backofficeApi } from '@/services/backofficeApi'
import { Card } from '@/components/ui/Card'

function StatCard({ icon: Icon, label, value, to }) {
  const body = (
    <Card className="flex h-full flex-col p-6">
      <div className="flex items-center gap-3 text-slate-500">
        <Icon className="h-5 w-5" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-4 font-heading text-3xl font-semibold text-slate-900">{value}</p>
    </Card>
  )
  if (to) {
    return (
      <Link to={to} className="block transition hover:opacity-90">
        {body}
      </Link>
    )
  }
  return body
}

export default function BackofficePage() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await backofficeApi.getOverview()
      setOverview(data)
    } catch (err) {
      toast.error(err.message || 'No se pudo cargar el resumen.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mx-auto max-w-[1400px] p-6 sm:p-8" data-testid="backoffice-page">
      <div className="mb-6">
        <h2 className="font-heading text-xl font-semibold text-slate-900">Consola de plataforma</h2>
        <p className="mt-1 text-sm text-slate-600">Resumen de compañías, usuarios y planes.</p>
      </div>

      {loading ? (
        <Card className="p-8 text-sm text-slate-500">Cargando resumen…</Card>
      ) : overview ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Building2}
              label="Compañías activas"
              value={overview.activeWorkspaces}
              to="/backoffice/companias"
            />
            <StatCard
              icon={Building2}
              label="Suspendidas"
              value={overview.suspendedWorkspaces}
              to="/backoffice/companias"
            />
            <StatCard icon={Users} label="Usuarios activos" value={overview.activeUsers} to="/backoffice/usuarios" />
            <StatCard icon={Users} label="Usuarios inactivos" value={overview.disabledUsers} to="/backoffice/usuarios?status=disabled" />
          </div>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2 text-slate-800">
              <Layers className="h-5 w-5" />
              <h3 className="text-sm font-semibold">Compañías por plan</h3>
            </div>
            {overview.workspacesByPlan?.length ? (
              <ul className="grid gap-2 sm:grid-cols-3">
                {overview.workspacesByPlan.map((item) => (
                  <li
                    key={item.planCode}
                    className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-slate-900">{item.planName}</span>
                    <span className="mt-1 block text-slate-600">{item.workspaceCount} compañías</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Sin suscripciones registradas.</p>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  )
}
