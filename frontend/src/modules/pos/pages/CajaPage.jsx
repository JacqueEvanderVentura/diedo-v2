import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import * as Icons from 'lucide-react'
import {
  Lock,
  Unlock,
  DollarSign,
  History,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
  ChevronRight,
  Ban,
} from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { MovementModal } from '../components/MovementModal'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { filterMovements, methodLabel, PAYMENT_BREAKDOWN, sumByMethod } from '../lib/caja'
import { cn } from '@/lib/utils'
import { PosSyncStatus } from '../components/PosSyncStatus'
import { usePosOnlineState } from '../hooks/usePosOnlineState'

const fmtTime = (iso) =>
  new Date(iso).toLocaleString('es-DO', { hour: '2-digit', minute: '2-digit' })

const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const TABS = [
  { id: 'todos', label: 'Todos' },
  { id: 'venta', label: 'Ventas' },
  { id: 'ingreso', label: 'Ingresos' },
  { id: 'egreso', label: 'Egresos' },
]

const TYPE_META = {
  venta: { label: 'venta', tone: 'brand', Icon: ShoppingBag },
  ingreso: { label: 'ingreso', tone: 'success', Icon: ArrowUpRight },
  egreso: { label: 'egreso', tone: 'danger', Icon: ArrowDownRight },
}

function KpiCard({ label, value, sub, children }) {
  return (
    <Card className="min-w-0 p-5">
      <p className="text-sm text-slate-500">{label}</p>
      {value != null && value !== '' && (
        <p className="mt-1 break-words font-heading text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      )}
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      {children}
    </Card>
  )
}

function RegisterHistoryPanel({ history }) {
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return history.filter((h) => {
      if (branchFilter !== 'all' && h.branchId !== branchFilter) return false
      if (!q) return true
      return h.userName?.toLowerCase().includes(q)
    })
  }, [history, search, branchFilter])

  const { rows: displayRows, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'closedAt', dir: 'desc' },
    accessors: {
      closedAt: (h) => new Date(h.closedAt),
      userName: (h) => h.userName || '',
      openingCash: (h) => h.openingCash || 0,
      expected: (h) => h.expected || 0,
      actual: (h) => h.actual || 0,
      difference: (h) => h.difference || 0,
    },
  })

  if (!history.length) return null
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 px-6 py-4">
        <h3 className="font-heading text-lg font-semibold text-slate-800">Historial de Cajas</h3>
      </div>
      <div className="px-4 pt-4">
        <DataFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por usuario..."
          showBranch
          branchId={branchFilter}
          onBranchChange={setBranchFilter}
          testId="caja-history-filters"
        />
      </div>
      <ResponsiveList columnCount={7}>
        <ResponsiveTable testId="caja-history-table" wrapCard={false}>
          <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <SortableTh column="closedAt" className="px-4 py-3">Fecha</SortableTh>
                <SortableTh column="userName" className="px-4 py-3">Usuario</SortableTh>
                <SortableTh column="openingCash" align="right" className="px-4 py-3">Inicial</SortableTh>
                <SortableTh column="expected" align="right" className="px-4 py-3">Esperado</SortableTh>
                <SortableTh column="actual" align="right" className="px-4 py-3">Real</SortableTh>
                <SortableTh column="difference" align="right" className="px-4 py-3">Diferencia</SortableTh>
                <SortableTh column="status" sortable={false} align="center" className="px-4 py-3">Estado</SortableTh>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((h) => (
                <tr key={h.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 text-slate-600">{fmtDateTime(h.closedAt)}</td>
                  <td className="px-4 py-3">{h.userName}</td>
                  <td className="px-4 py-3 text-right">{formatDOP(h.openingCash)}</td>
                  <td className="px-4 py-3 text-right">{formatDOP(h.expected)}</td>
                  <td className="px-4 py-3 text-right">{formatDOP(h.actual)}</td>
                  <td className={cn('px-4 py-3 text-right font-medium', h.difference !== 0 ? 'text-amber-600' : 'text-slate-600')}>
                    {formatDOP(h.difference)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={h.difference === 0 ? 'success' : 'warning'}>{h.difference === 0 ? 'Cuadrado' : 'Diferencia'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </SortableTableProvider>
        </ResponsiveTable>
        <ResponsiveCards testId="caja-history-cards" className="p-4">
          {displayRows.map((h) => (
            <MobileCard key={h.id} testId={`caja-history-card-${h.id}`}>
              <MobileCardHeader
                title={h.userName}
                subtitle={fmtDateTime(h.closedAt)}
                badge={<Badge tone={h.difference === 0 ? 'success' : 'warning'}>{h.difference === 0 ? 'Cuadrado' : 'Diferencia'}</Badge>}
              />
              <MobileCardGrid>
                <MobileField label="Inicial">{formatDOP(h.openingCash)}</MobileField>
                <MobileField label="Esperado">{formatDOP(h.expected)}</MobileField>
                <MobileField label="Real">{formatDOP(h.actual)}</MobileField>
                <MobileField label="Diferencia">
                  <span className={cn('font-medium', h.difference !== 0 ? 'text-amber-600' : 'text-slate-600')}>
                    {formatDOP(h.difference)}
                  </span>
                </MobileField>
              </MobileCardGrid>
            </MobileCard>
          ))}
        </ResponsiveCards>
      </ResponsiveList>
    </Card>
  )
}

export default function CajaPage() {
  const { isOnline, hydrating, mutating, error, refresh } = usePosOnlineState()
  const register = usePosStore((s) => s.register)
  const shiftSales = usePosStore((s) => s.shiftSales)
  const shiftIncomes = usePosStore((s) => s.shiftIncomes)
  const expenses = usePosStore((s) => s.expenses)
  const registerHistory = usePosStore((s) => s.registerHistory)
  const registerSummary = usePosStore((s) => s.registerSummary)
  const quoteSummary = usePosStore((s) => s.quoteSummary)
  const pagination = usePosStore((s) => s.pagination)
  const branchId = usePosStore((s) => s.branchId)
  const setBranch = usePosStore((s) => s.setBranch)
  const getCashInDrawer = usePosStore((s) => s.getCashInDrawer)
  const getCashIncomes = usePosStore((s) => s.getCashIncomes)
  const getCashExpenses = usePosStore((s) => s.getCashExpenses)
  const getShiftSalesTotal = usePosStore((s) => s.getShiftSalesTotal)
  const getShiftMovements = usePosStore((s) => s.getShiftMovements)
  const getPendingTotal = usePosStore((s) => s.getPendingTotal)
  const getOpenQuotesTotal = usePosStore((s) => s.getOpenQuotesTotal)
  const openQuotes = usePosStore((s) => s.openQuotes)
  const openRegister = usePosStore((s) => s.openRegister)
  const closeRegister = usePosStore((s) => s.closeRegister)
  const voidSale = usePosStore((s) => s.voidSale)
  const loadMoreShiftSales = usePosStore((s) => s.loadMoreShiftSales)
  const loadMoreCashMovements = usePosStore((s) => s.loadMoreCashMovements)
  const lastCloseSummary = usePosStore((s) => s.lastCloseSummary)
  const branches = useConfigStore((s) => s.branches)
  const canManageRegister = useSessionStore((s) => s.hasPermission('pos.register.manage'))
  const canManageCash = useSessionStore((s) => s.hasPermission('pos.cash.manage'))
  const canVoidSales = useSessionStore((s) => s.hasPermission('pos.void'))

  const [openInput, setOpenInput] = useState('')
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeInput, setCloseInput] = useState('')
  const [closeError, setCloseError] = useState('')
  const [saleToVoid, setSaleToVoid] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError] = useState('')
  const [movementOpen, setMovementOpen] = useState(false)
  const [tab, setTab] = useState('todos')

  const movements = useMemo(() => getShiftMovements(), [shiftSales, shiftIncomes, expenses, getShiftMovements])
  const filtered = useMemo(() => filterMovements(movements, tab), [movements, tab])

  const totalSales = useMemo(() => getShiftSalesTotal(), [shiftSales, getShiftSalesTotal])
  const totalIncomes = useMemo(() => getCashIncomes(), [shiftIncomes, getCashIncomes])
  const totalExpenses = useMemo(() => getCashExpenses(), [expenses, getCashExpenses])
  const expectedCash = getCashInDrawer()

  const salesCount = isOnline && registerSummary
    ? registerSummary.salesCount
    : shiftSales.filter((sale) => sale.status !== 'voided').length
  const pendingCxc = getPendingTotal()
  const openQuotesTotal = getOpenQuotesTotal()
  const openQuotesCount = isOnline && quoteSummary
    ? quoteSummary.openCount
    : openQuotes.length
  const salesPage = pagination?.sales || {}
  const movementsPage = pagination?.movements || {}
  const hasMoreSales = isOnline && salesPage.page < salesPage.totalPages
  const hasMoreCashMovements = isOnline && movementsPage.page < movementsPage.totalPages
  const loadingMore = Boolean(salesPage.loading || movementsPage.loading)

  const handleLoadMore = async () => {
    try {
      await Promise.all([
        hasMoreSales ? loadMoreShiftSales() : Promise.resolve(false),
        hasMoreCashMovements ? loadMoreCashMovements() : Promise.resolve(false),
      ])
    } catch (operationError) {
      toast.error(operationError.message || 'No se pudieron cargar movimientos anteriores.')
    }
  }

  const handleOpen = async () => {
    if (!canManageRegister) {
      toast.error('No tienes permiso para gestionar la apertura de caja.')
      return
    }
    try {
      await openRegister(openInput || 0)
      toast.success(`Caja abierta con ${formatDOP(openInput || 0)}`)
      setOpenInput('')
    } catch (operationError) {
      toast.error(operationError.message || 'No se pudo abrir la caja.')
    }
  }

  const handleClose = async () => {
    if (!canManageRegister) {
      toast.error('No tienes permiso para cerrar la caja.')
      return
    }
    const countedCash = Number(closeInput)
    if (!closeInput.trim() || !Number.isFinite(countedCash) || countedCash < 0) {
      setCloseError('Ingresa el efectivo real contado (un monto mayor o igual a cero).')
      return
    }
    try {
      await closeRegister(countedCash)
      toast.success('Caja cerrada. Revisa el resumen del turno.')
      setCloseOpen(false)
      setCloseInput('')
      setCloseError('')
    } catch (operationError) {
      toast.error(operationError.message || 'No se pudo cerrar la caja.')
    }
  }

  const handleVoidSale = async () => {
    if (!canVoidSales) {
      toast.error('No tienes permiso para anular ventas.')
      return
    }
    if (!saleToVoid) return
    if (voidReason.trim().length < 2) {
      setVoidError('Indica un motivo de al menos 2 caracteres.')
      return
    }
    try {
      const result = await voidSale(saleToVoid.id, voidReason.trim())
      if (!result) throw new Error('La venta ya no está disponible para anular.')
      toast.success('Venta anulada; los totales de caja fueron actualizados.')
      setSaleToVoid(null)
      setVoidReason('')
      setVoidError('')
    } catch (operationError) {
      const message = operationError.message || 'No se pudo anular la venta.'
      setVoidError(message)
      toast.error(message)
    }
  }

  if (!register.open) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6 sm:p-8">
        <PosSyncStatus isOnline={isOnline} hydrating={hydrating} error={error} onRetry={refresh} />
        <Card className="p-8" data-testid="caja-open-card">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Unlock className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-slate-900">Abrir caja</h2>
              <p className="text-sm text-slate-400">Registra el efectivo inicial del turno.</p>
            </div>
          </div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Efectivo inicial (RD$)</label>
          <input
            type="number"
            value={openInput}
            onChange={(e) => setOpenInput(e.target.value)}
            placeholder="0.00"
            data-testid="caja-opening-input"
            className="mb-4 w-full rounded-xl border-0 bg-white py-3 px-4 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
          <Button className="w-full" size="lg" onClick={handleOpen} disabled={Boolean(mutating) || !canManageRegister} data-testid="caja-open-btn">
            <Unlock className="h-4 w-4" /> Abrir caja
          </Button>
        </Card>

        {lastCloseSummary && (
          <Card className="p-6" data-testid="caja-last-close">
            <h3 className="mb-4 font-heading text-lg font-semibold text-slate-800">Último cierre</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-500"><dt>Efectivo inicial</dt><dd className="font-medium text-slate-700">{formatDOP(lastCloseSummary.openingCash)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>Total ventas</dt><dd className="font-medium text-slate-700">{formatDOP(lastCloseSummary.totalSales)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>Ventas en efectivo</dt><dd className="font-medium text-slate-700">{formatDOP(lastCloseSummary.cashSales)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>Cobros CxC en efectivo</dt><dd className="font-medium text-slate-700">{formatDOP(lastCloseSummary.cashReceivablePayments)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>Ingresos</dt><dd className="font-medium text-emerald-600">+{formatDOP(lastCloseSummary.cashIncomes || 0)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>Egresos</dt><dd className="font-medium text-red-600">−{formatDOP(lastCloseSummary.expenses)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-heading font-bold text-slate-900">Efectivo esperado</dt><dd className="font-heading text-lg font-bold text-blue-600">{formatDOP(lastCloseSummary.expected)}</dd></div>
              <p className="pt-1 text-xs text-slate-400">Cerrada el {fmtDateTime(lastCloseSummary.closedAt)}</p>
            </dl>
          </Card>
        )}

        <RegisterHistoryPanel history={registerHistory} />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="caja-page">
      <PosSyncStatus isOnline={isOnline} hydrating={hydrating} error={error} onRetry={refresh} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Unlock className="h-7 w-7" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold text-slate-900">Caja Abierta</h2>
            <p className="text-sm text-slate-500">Abierta desde {fmtDateTime(register.openedAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setMovementOpen(true)} disabled={Boolean(mutating) || !canManageCash} data-testid="caja-add-movement">
            <DollarSign className="h-4 w-4" /> Movimiento
          </Button>
          <Button
            variant="dangerSolid"
            onClick={() => {
              setCloseInput('')
              setCloseError('')
              setCloseOpen(true)
            }}
            disabled={Boolean(mutating) || !canManageRegister}
            data-testid="caja-close-btn"
          >
            <Lock className="h-4 w-4" /> Cerrar Caja
          </Button>
          <Select
            value={branchId}
            onChange={setBranch}
            disabled={Boolean(mutating)}
            className="w-[180px]"
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label="Total Ventas"
              value={formatDOP(totalSales)}
              sub={`${salesCount} transacciones`}
            />
            <KpiCard label="Efectivo Esperado" value={formatDOP(expectedCash)} />
            <KpiCard label="Movimientos">
              <div className="mt-2 space-y-1">
                <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
                  <ArrowUpRight className="h-4 w-4 shrink-0" />
                  <span className="tabular-nums">+{formatDOP(totalIncomes)}</span>
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-red-600">
                  <ArrowDownRight className="h-4 w-4 shrink-0" />
                  <span className="tabular-nums">−{formatDOP(totalExpenses)}</span>
                </span>
              </div>
            </KpiCard>
            <KpiCard
              label="CxC pendiente"
              value={formatDOP(pendingCxc)}
              sub="Cuentas por cobrar activas"
            />
            <KpiCard
              label="Cotizaciones abiertas"
              value={formatDOP(openQuotesTotal)}
              sub={`${openQuotesCount} cuenta${openQuotesCount !== 1 ? 's' : ''} abierta${openQuotesCount !== 1 ? 's' : ''}`}
            />
          </div>

          <Card className="p-6" data-testid="caja-movements">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-blue-600" />
                <h3 className="font-heading text-lg font-semibold text-slate-900">Movimientos del Día</h3>
                <Badge tone="brand" className="uppercase tracking-wider">En vivo</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  {salesCount} ventas · {formatDOP(totalSales)}
                </span>
                <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  <ArrowUpRight className="h-3 w-3" />+{formatDOP(totalIncomes)}
                </span>
                <span className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
                  <ArrowDownRight className="h-3 w-3" />−{formatDOP(totalExpenses)}
                </span>
              </div>
            </div>

            <div className="mb-4 flex w-fit gap-1 rounded-lg bg-slate-100 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <AnimatedTabPanel panelKey={tab}>
              {filtered.length === 0 ? (
                <EmptyState icon={History} title="Sin movimientos" description="Las ventas, ingresos y egresos del turno aparecerán aquí." />
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {filtered.map((m) => {
                    const meta = TYPE_META[m.type]
                    const Icon = meta.Icon
                    const isOut = m.type === 'egreso'
                    return (
                      <div key={`${m.type}-${m.id}`} className="group flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition-colors hover:bg-slate-100">
                        <div className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          m.type === 'venta' ? 'bg-blue-50 text-blue-600' : m.type === 'ingreso' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-800">{m.label}</p>
                            <Badge tone={meta.tone} className="shrink-0 text-[9px] uppercase">{meta.label}</Badge>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <p className="text-[10px] text-slate-400">{fmtTime(m.createdAt)}</p>
                            {m.method && (
                              <span className="rounded bg-slate-200/80 px-1 text-[10px] text-slate-500">{methodLabel(m.method)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className={cn('text-sm font-bold', isOut ? 'text-red-600' : 'text-slate-900')}>
                            {isOut ? '−' : '+'}{formatDOP(m.amount)}
                          </span>
                          {m.type === 'venta' && canVoidSales && (
                            <button
                              type="button"
                              title="Anular venta"
                              disabled={Boolean(mutating)}
                              onClick={() => {
                                setSaleToVoid(m.meta)
                                setVoidReason('')
                                setVoidError('')
                              }}
                              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                              data-testid={`caja-void-sale-${m.id}`}
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                          <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </AnimatedTabPanel>
            {(hasMoreSales || hasMoreCashMovements) && (
              <div className="mt-4 flex justify-center border-t border-slate-100 pt-4">
                <Button
                  variant="secondary"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  data-testid="caja-load-more"
                >
                  {loadingMore ? 'Cargando…' : 'Cargar movimientos anteriores'}
                </Button>
              </div>
            )}
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h3 className="mb-4 font-heading font-semibold text-slate-900">Por método de pago</h3>
          <div className="space-y-3">
            {PAYMENT_BREAKDOWN.map((pm) => {
              const Icon = Icons[pm.icon] || Icons.Wallet
              const authoritativeMethod = registerSummary?.salesByPaymentMethod?.find(
                (row) => row.paymentMethod?.id === pm.id || row.paymentMethod?.semanticCode === pm.id
              )
              const total = isOnline && registerSummary
                ? authoritativeMethod?.salesTotal || 0
                : sumByMethod(shiftSales, pm.id)
              return (
                <div key={pm.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-medium text-slate-700">{pm.label}</span>
                  </div>
                  <span className="text-lg font-bold text-slate-900">{formatDOP(total)}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Efectivo inicial</span>
              <span className="font-semibold">{formatDOP(register.openingCash)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">En caja ahora</span>
              <span className="font-heading text-lg font-bold text-blue-600">{formatDOP(expectedCash)}</span>
            </div>
          </div>
        </Card>
      </div>

      <RegisterHistoryPanel history={registerHistory} />

      <MovementModal open={movementOpen} onClose={() => setMovementOpen(false)} />

      <Modal
        open={closeOpen}
        onClose={() => {
          if (mutating) return
          setCloseOpen(false)
          setCloseError('')
        }}
        title="Arqueo y cierre de caja"
        testId="caja-close-modal"
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Efectivo esperado</span>
              <span className="font-semibold text-slate-800">{formatDOP(expectedCash)}</span>
            </div>
            {closeInput.trim() && Number.isFinite(Number(closeInput)) && Number(closeInput) >= 0 && (
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-slate-500">
                <span>Diferencia estimada</span>
                <span className={cn('font-semibold', Math.abs(Number(closeInput) - expectedCash) > 0.009 ? 'text-amber-700' : 'text-emerald-700')}>
                  {formatDOP(Number(closeInput) - expectedCash)}
                </span>
              </div>
            )}
          </div>
          <div>
            <label htmlFor="caja-counted-cash" className="mb-1.5 block text-sm font-medium text-slate-700">
              Efectivo real contado (RD$)
            </label>
            <input
              id="caja-counted-cash"
              type="number"
              min="0"
              step="0.01"
              value={closeInput}
              onChange={(event) => {
                setCloseInput(event.target.value)
                setCloseError('')
              }}
              placeholder="0.00"
              autoFocus
              data-testid="caja-counted-input"
              className="w-full rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
            {closeError && <p className="mt-1.5 text-sm font-medium text-red-600">{closeError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCloseOpen(false)} disabled={Boolean(mutating)}>
              Cancelar
            </Button>
            <Button variant="dangerSolid" onClick={handleClose} disabled={Boolean(mutating)} data-testid="caja-confirm-close-btn">
              <Lock className="h-4 w-4" /> Confirmar cierre
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!saleToVoid}
        onClose={() => {
          if (mutating) return
          setSaleToVoid(null)
          setVoidReason('')
          setVoidError('')
        }}
        title="Anular venta"
        testId="caja-void-sale-modal"
      >
        {saleToVoid && (
          <div className="space-y-4">
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900">
              <p className="font-semibold">{saleToVoid.customer?.name || saleToVoid.items?.[0]?.name || 'Venta POS'}</p>
              <p className="mt-1">Monto a anular: {formatDOP(saleToVoid.total)}</p>
            </div>
            <div>
              <label htmlFor="caja-void-reason" className="mb-1.5 block text-sm font-medium text-slate-700">
                Motivo de anulación
              </label>
              <textarea
                id="caja-void-reason"
                value={voidReason}
                onChange={(event) => {
                  setVoidReason(event.target.value)
                  setVoidError('')
                }}
                rows={3}
                maxLength={1000}
                autoFocus
                placeholder="Ej. Cobro duplicado o producto incorrecto"
                data-testid="caja-void-reason"
                className="w-full resize-none rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-red-500"
              />
              {voidError && <p className="mt-1.5 text-sm font-medium text-red-600">{voidError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSaleToVoid(null)} disabled={Boolean(mutating)}>
                Cancelar
              </Button>
              <Button variant="dangerSolid" onClick={handleVoidSale} disabled={Boolean(mutating)} data-testid="caja-confirm-void-sale">
                <Ban className="h-4 w-4" /> Anular venta
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
