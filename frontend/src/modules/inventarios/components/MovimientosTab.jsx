import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  CalendarClock,
  History,
  Loader2,
  MessageSquareText,
  PackagePlus,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react'
import { useInventarioStore } from '@/stores/inventarioStore'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { useSortedRows } from '@/hooks/useTableControls'
import { SalidaMultipleModal } from './SalidaMultipleModal'
import { AjusteStockModal } from './AjusteStockModal'

const TYPE_META = {
  salida: {
    label: 'Salida',
    tone: 'warning',
    icon: ArrowDownToLine,
    accentClass: 'bg-orange-400',
    iconClass: 'bg-orange-100 text-orange-700',
    rowClass: 'bg-gradient-to-r from-orange-50/70 via-white to-white hover:from-orange-50',
  },
  ajuste: {
    label: 'Ajuste',
    tone: 'brand',
    icon: SlidersHorizontal,
    accentClass: 'bg-blue-500',
    iconClass: 'bg-blue-100 text-blue-700',
    rowClass: 'bg-gradient-to-r from-blue-50/70 via-white to-white hover:from-blue-50',
  },
  apertura: {
    label: 'Existencia inicial',
    tone: 'success',
    icon: PackagePlus,
    accentClass: 'bg-emerald-500',
    iconClass: 'bg-emerald-100 text-emerald-700',
    rowClass: 'bg-gradient-to-r from-emerald-50/60 via-white to-white hover:from-emerald-50',
  },
  entrada: {
    label: 'Entrada',
    tone: 'success',
    icon: ArrowUpFromLine,
    accentClass: 'bg-teal-500',
    iconClass: 'bg-teal-100 text-teal-700',
    rowClass: 'bg-gradient-to-r from-teal-50/60 via-white to-white hover:from-teal-50',
  },
}

const FALLBACK_TYPE_META = {
  label: 'Movimiento',
  tone: 'neutral',
  icon: History,
  accentClass: 'bg-slate-400',
  iconClass: 'bg-slate-100 text-slate-600',
  rowClass: 'bg-white hover:bg-slate-50/70',
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos los movimientos' },
  { value: 'salida', label: 'Salidas' },
  { value: 'ajuste', label: 'Ajustes' },
  { value: 'apertura', label: 'Existencias iniciales' },
  { value: 'entrada', label: 'Entradas' },
]

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function formatQuantity(value) {
  return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 3 }).format(Number(value) || 0)
}

function MovementItem({ item, movementType }) {
  const hasSnapshot = item.before != null && item.after != null
  const delta = Number(item.delta) || 0
  const sign = delta > 0 ? '+' : ''
  const quantityClass = movementType === 'salida'
    ? 'bg-orange-100 text-orange-700'
    : delta > 0
      ? 'bg-emerald-100 text-emerald-700'
      : delta < 0
        ? 'bg-rose-100 text-rose-700'
        : 'bg-slate-100 text-slate-600'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/90 bg-white/80 px-3 py-2 shadow-sm ring-1 ring-inset ring-slate-100">
      <span className="text-sm font-semibold text-slate-700">{item.name}</span>
      {hasSnapshot ? (
        <>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
            {formatQuantity(item.before)} <span className="text-slate-400">→</span> {formatQuantity(item.after)}
          </span>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${quantityClass}`}>
            {sign}{formatQuantity(delta)} {item.unit || 'ud'}
          </span>
        </>
      ) : (
        <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700">
          −{formatQuantity(item.qty)} {item.unit || 'ud'}
        </span>
      )}
    </div>
  )
}

export function MovimientosTab() {
  const movements = useInventarioStore((state) => state.movements)
  const hydrating = useInventarioStore((state) => state.hydrating)
  const error = useInventarioStore((state) => state.error)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [salidaOpen, setSalidaOpen] = useState(false)
  const [ajusteOpen, setAjusteOpen] = useState(false)

  const filtered = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase()
    return movements.filter((movement) => {
      if (branchFilter !== 'all' && movement.branchId !== branchFilter) return false
      if (typeFilter !== 'all' && movement.type !== typeFilter) return false
      if (!normalizedQuery) return true
      const searchable = [
        movement.comment,
        movement.employeeName,
        movement.employee,
        movement.createdBy,
        movement.appointmentLabel,
        movement.branchName,
        ...(movement.items || []).map((item) => `${item.name} ${item.sku || ''}`),
      ].join(' ').toLowerCase()
      return searchable.includes(normalizedQuery)
    })
  }, [movements, search, branchFilter, typeFilter])

  const { rows: sorted, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'createdAt', dir: 'desc' },
    accessors: {
      createdAt: (movement) => new Date(movement.createdAt),
      employee: (movement) => movement.employeeName || movement.employee || movement.createdBy || '',
      items: (movement) => (movement.items || []).length,
    },
  })

  return (
    <>
      <Card className="overflow-hidden" data-testid="movimientos-table">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-heading text-lg font-semibold text-slate-900">Historial de Movimientos</h3>
            <p className="mt-1 text-sm text-slate-500">Salidas, ajustes y existencias iniciales registradas en inventario.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAjusteOpen(true)} data-testid="open-ajuste-stock">
              <SlidersHorizontal className="h-4 w-4" /> Ajustar stock
            </Button>
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700" onClick={() => setSalidaOpen(true)} data-testid="open-salida-multiple">
              <ArrowDownToLine className="h-4 w-4" /> Registrar salida
            </Button>
          </div>
        </div>

        <div className="border-b border-slate-100 p-4">
          <DataFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por ítem, empleado o comentario…"
            showBranch
            branchId={branchFilter}
            onBranchChange={setBranchFilter}
            filters={[{
              id: 'type',
              label: 'Tipo',
              value: typeFilter,
              onChange: setTypeFilter,
              options: TYPE_OPTIONS,
            }]}
            testId="movimientos-filters"
          />
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {[
              { key: 'createdAt', label: 'Fecha' },
              { key: 'employee', label: 'Responsable' },
              { key: 'items', label: 'Ítems' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => toggleSort(option.key)}
                className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                  sortKey === option.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label} {sortKey === option.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700" role="alert">{error}</p>}
        {hydrating && (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando movimientos…
          </div>
        )}
        {!hydrating && sorted.length === 0 ? (
          <EmptyState icon={History} title="Sin movimientos" description="Las salidas y ajustes registrados aparecerán aquí." className="py-14" />
        ) : !hydrating && (
          <div className="divide-y divide-slate-50">
            {sorted.map((movement) => {
              const typeMeta = TYPE_META[movement.type] || {
                ...FALLBACK_TYPE_META,
                label: movement.type || FALLBACK_TYPE_META.label,
              }
              const TypeIcon = typeMeta.icon
              const responsible = movement.employeeName || movement.employee || movement.createdBy || 'Sistema'
              return (
                <div
                  key={movement.id}
                  className={`relative px-5 py-5 transition-colors ${typeMeta.rowClass}`}
                  data-testid={`movimiento-${movement.id}`}
                >
                  <span className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${typeMeta.accentClass}`} aria-hidden="true" />
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${typeMeta.iconClass}`}>
                      <TypeIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={typeMeta.tone}>{typeMeta.label}</Badge>
                          <span className="text-xs font-medium text-slate-400">{formatDate(movement.createdAt)}</span>
                          {movement.branchName && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                              <Building2 className="h-3 w-3" aria-hidden="true" /> {movement.branchName}
                            </span>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                          <UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> {responsible}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(movement.items || []).map((item) => (
                          <MovementItem key={item.lineId || item.id} item={item} movementType={movement.type} />
                        ))}
                      </div>

                      {(movement.comment || movement.appointmentLabel) && (
                        <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-200/70 pt-2.5 text-xs sm:flex-row sm:flex-wrap sm:gap-4">
                          {movement.comment && (
                            <span className="inline-flex items-start gap-1.5 text-slate-500">
                              <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                              {movement.comment}
                            </span>
                          )}
                          {movement.appointmentLabel && (
                            <span className="inline-flex items-start gap-1.5 font-medium text-blue-600">
                              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {movement.appointmentLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <SalidaMultipleModal open={salidaOpen} onClose={() => setSalidaOpen(false)} branchId={branchFilter} />
      <AjusteStockModal open={ajusteOpen} onClose={() => setAjusteOpen(false)} branchId={branchFilter} />
    </>
  )
}
