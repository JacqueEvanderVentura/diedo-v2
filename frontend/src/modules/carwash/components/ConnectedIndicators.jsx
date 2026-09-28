import { useCallback } from 'react'
import { CheckCircle2, Clock3, DollarSign, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { carwashApi } from '../api'
import { currencyFormatter } from '../lib/settings'
import { useCarwashRead } from '../lib/useCarwashRead'
import { CarwashMetric } from './CarwashPrimitives'

export function ConnectedIndicators({ branchId, workspace, revision }) {
  const load = useCallback(() => carwashApi.indicators(branchId), [branchId])
  const { data, source, reload } = useCarwashRead(load, revision, !!branchId)
  const money = currencyFormatter({ ...workspace, defaultCurrency: data?.currency || workspace?.defaultCurrency })
  return <div className="space-y-2" data-testid="carwash-indicators" aria-busy={source.status === 'loading'}>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4">
      <CarwashMetric label="En espera / Lavando" value={data?.activeWashes ?? '—'} icon={Clock3} />
      <CarwashMetric label="Completados hoy" value={data?.completedToday ?? '—'} icon={CheckCircle2} tone="green" />
      <CarwashMetric label="Facturado hoy" value={data ? money(data.billedToday) : '—'} icon={DollarSign} tone="violet" />
      <CarwashMetric label="Comisiones pendientes" value={data ? data.pendingCommissions === null ? 'Sin permiso' : money(data.pendingCommissions) : '—'} icon={Wallet} tone="amber" />
    </div>
    {['error', 'stale'].includes(source.status) && <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-amber-800"><p>{source.status === 'stale' ? 'Indicadores sin actualizar; mostrando la última consulta.' : 'No fue posible cargar los indicadores.'}</p><Button type="button" size="sm" variant="ghost" onClick={reload}>Actualizar indicadores</Button></div>}
    {data && <p className="text-xs text-slate-500">Hoy: {data.today} · {data.timezone}. Comisiones pendientes de todo el historial.</p>}
  </div>
}
