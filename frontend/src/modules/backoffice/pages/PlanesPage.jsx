import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { backofficeApi } from '@/services/backofficeApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

const CORE_MODULES = new Set(['foundation', 'iam'])

export default function PlanesPage() {
  const [plans, setPlans] = useState([])
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  const moduleNameByCode = useMemo(
    () => Object.fromEntries(modules.map((item) => [item.code, item.name])),
    [modules],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [planData, moduleData] = await Promise.all([
        backofficeApi.listPlans(),
        backofficeApi.listModules(),
      ])
      setPlans(planData.items || [])
      setModules(moduleData.items || [])
    } catch (err) {
      toast.error(err.message || 'No se pudieron cargar los planes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleModule = (planId, code) => {
    setPlans((current) =>
      current.map((plan) => {
        if (plan.planId !== planId || CORE_MODULES.has(code)) return plan
        const selected = new Set(plan.moduleCodes || [])
        if (selected.has(code)) selected.delete(code)
        else selected.add(code)
        return { ...plan, moduleCodes: [...selected].sort() }
      }),
    )
  }

  const savePlan = async (plan) => {
    setSavingId(plan.planId)
    try {
      const updated = await backofficeApi.updatePlan(plan.planId, {
        version: plan.version,
        moduleCodes: plan.moduleCodes,
      })
      setPlans((current) => current.map((item) => (item.planId === updated.planId ? updated : item)))
      toast.success(`Plan ${updated.name} actualizado`)
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar el plan.')
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
          Define qué módulos incluye cada pack. `foundation` e `iam` siempre van incluidos.
        </p>
      </div>

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
            <div className="flex flex-1 flex-wrap gap-2">
              {modules.map((module) => {
                const selected = (plan.moduleCodes || []).includes(module.code)
                const locked = CORE_MODULES.has(module.code)
                return (
                  <button
                    key={`${plan.planId}-${module.code}`}
                    type="button"
                    disabled={locked}
                    onClick={() => toggleModule(plan.planId, module.code)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      selected
                        ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    } ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    {moduleNameByCode[module.code] || module.code}
                  </button>
                )
              })}
            </div>
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
