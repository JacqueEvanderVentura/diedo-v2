import { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { useInventarioStore } from '@/stores/inventarioStore'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { useSortedRows } from '@/hooks/useTableControls'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function MovimientosTab() {
  const movements = useInventarioStore((s) => s.movements)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return movements.filter((m) => {
      if (branchFilter !== 'all' && m.branchId !== branchFilter) return false
      if (!q) return true
      const hay = [
        m.comment,
        m.employeeName,
        m.employee,
        m.appointmentLabel,
        ...(m.items || []).map((i) => `${i.name} ${i.qty}`),
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [movements, search, branchFilter])

  const { rows: sorted, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'createdAt', dir: 'desc' },
    accessors: {
      createdAt: (m) => new Date(m.createdAt),
      employee: (m) => m.employeeName || m.employee,
      items: (m) => (m.items || []).length,
    },
  })

  return (
    <Card className="overflow-hidden" data-testid="movimientos-table">
      <div className="border-b border-slate-100 p-5">
        <h3 className="font-heading text-lg font-semibold text-slate-900">Historial de Movimientos</h3>
        <p className="mt-1 text-sm text-slate-500">Salidas y ajustes registrados en inventario.</p>
      </div>

      <div className="border-b border-slate-100 p-4">
        <DataFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por producto, empleado o comentario…"
          showBranch
          branchId={branchFilter}
          onBranchChange={setBranchFilter}
          testId="movimientos-filters"
        />
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            { key: 'createdAt', label: 'Fecha' },
            { key: 'employee', label: 'Empleado' },
            { key: 'items', label: 'Ítems' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggleSort(opt.key)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                sortKey === opt.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label} {sortKey === opt.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          ))}
        </div>
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
                  {m.appointmentLabel && (
                    <p className="mt-1 text-xs text-blue-600">Cita: {m.appointmentLabel}</p>
                  )}
                </div>
                <p className="text-xs font-medium text-slate-500">{m.employeeName || m.employee}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
