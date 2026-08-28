import { useMemo } from 'react'
import { History } from 'lucide-react'
import { useInventarioStore } from '@/stores/inventarioStore'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function MovimientosTab() {
  const movements = useInventarioStore((s) => s.movements)

  const sorted = useMemo(
    () => [...movements].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [movements]
  )

  return (
    <Card className="overflow-hidden" data-testid="movimientos-table">
      <div className="border-b border-slate-100 p-5">
        <h3 className="font-heading text-lg font-semibold text-slate-900">Historial de Movimientos</h3>
        <p className="mt-1 text-sm text-slate-500">Salidas y ajustes registrados en inventario.</p>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={History} title="Sin movimientos" description="Las salidas múltiples aparecerán aquí." className="py-14" />
      ) : (
        <div className="divide-y divide-slate-50">
          {sorted.map((m) => (
            <div key={m.id} className="px-5 py-4" data-testid={`movimiento-${m.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="warning">Salida múltiple</Badge>
                    <span className="text-xs text-slate-400">{formatDate(m.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {m.items.map((i) => `${i.name} (×${i.qty})`).join(', ')}
                  </p>
                  {m.comment && <p className="mt-1 text-xs italic text-slate-400">{m.comment}</p>}
                </div>
                <p className="text-xs font-medium text-slate-500">{m.employee}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
