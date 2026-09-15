import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { backofficeApi } from '@/services/backofficeApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

import { ModulePicker } from '../components/ModulePicker'

export default function PlanesPage() {
  const [plans, setPlans] = useState([])
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [planData, moduleData] = await Promise.all([
        backofficeApi.listPlans(),
        backofficeApi.listModules(),
      ])
      setPlans(planData.items || [])
      setModules(moduleData.items || [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los planes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const savePlan = async (plan) => {
    setSavingId(plan.planId)
    setError('')
    try {
      const updated = await backofficeApi.updatePlan(plan.planId, {
        version: plan.version,
        moduleCodes: plan.moduleCodes,
      })
      setPlans((current) =>
        current.map((item) => (item.planId === updated.planId ? updated : item))
      )
      toast.success(`Plan ${updated.name} actualizado`)
    } catch (err) {
      setError(err.message || 'No se pudo guardar el plan.')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] p-6 sm:p-8">
        <Card className="p-8 text-sm text-slate-500">Cargando planes…</Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6 sm:p-8" data-testid="backoffice-planes-page">
      <div className="mb-6">
        <h2 className="font-heading text-xl font-semibold text-slate-900">Planes comerciales</h2>
        <p className="mt-1 text-sm text-slate-600">
          Los cambios se aplican a nuevas asignaciones y al restaurar los módulos de una compañía.
          Las compañías existentes conservan sus módulos.
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          {error}
          <Button variant="secondary" className="ml-3" onClick={load}>
            Recargar datos actuales
          </Button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.planId} className="flex flex-col p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-lg font-semibold text-slate-900">{plan.name}</h3>
                <p className="font-mono text-xs text-slate-500">{plan.code}</p>
              </div>
              <Badge tone={plan.status === 'active' ? 'success' : 'neutral'}>{plan.status}</Badge>
            </div>
            <p className="mb-4 text-sm text-slate-600">{plan.description}</p>
            <ModulePicker
              modules={modules}
              selected={plan.moduleCodes || []}
              disabled={savingId === plan.planId}
              onChange={(codes) =>
                setPlans((current) =>
                  current.map((item) =>
                    item.planId === plan.planId ? { ...item, moduleCodes: codes } : item
                  )
                )
              }
            />
            <Button
              type="button"
              className="mt-5"
              disabled={savingId === plan.planId}
              onClick={() => savePlan(plan)}
            >
              {savingId === plan.planId ? 'Guardando…' : 'Guardar plan'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
