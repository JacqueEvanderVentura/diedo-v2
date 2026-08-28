import { useNavigate } from 'react-router-dom'
import { Package } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

export function StockAlerts({ alerts }) {
  const navigate = useNavigate()
  const goInventarios = () => navigate('/inventarios')

  return (
    <Card className="flex h-full flex-col p-6" data-testid="dashboard-stock-alerts">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-lg font-semibold tracking-tight text-slate-800">
          Alertas de Stock
        </h3>
        <button
          type="button"
          onClick={goInventarios}
          data-testid="stock-alerts-view-all"
          className="text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
        >
          Ver Todo
        </button>
      </div>

      <div className="-mr-2 max-h-[320px] space-y-2.5 overflow-y-auto pr-2 scrollbar-thin">
        {alerts.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={goInventarios}
            data-testid={`stock-alert-${item.id}`}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition-colors hover:border-blue-100 hover:bg-slate-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
              <Package className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
              <p className="text-xs text-slate-400">SKU: {item.sku}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-800">{item.units} unidades</p>
              <p
                className={cn(
                  'text-[11px] font-bold uppercase tracking-wide',
                  item.level === 'critical' ? 'text-red-500' : 'text-amber-500'
                )}
              >
                {item.level === 'critical' ? 'Crítico' : 'Bajo'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </Card>
  )
}
