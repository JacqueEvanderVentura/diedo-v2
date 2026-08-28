import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ReceiptText,
  ArrowLeftRight,
  Link2,
  Clock,
  CheckCircle2,
  Paperclip,
  Search,
  Eye,
  Pencil,
  DollarSign,
  Trash2,
  History,
  Banknote,
  Upload,
  FileText,
  ShoppingBag,
  ExternalLink,
  CalendarDays,
} from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { ReceivableEditModal } from '../components/ReceivableEditModal'
import { ReceivablePaymentModal } from '../components/ReceivablePaymentModal'
import { ReceivableProofModal } from '../components/ReceivableProofModal'
import { ReceivableCollectMenu } from '../components/ReceivableCollectMenu'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardFooter,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import {
  getBalance,
  getPaidAmount,
  getReceivableStatus,
  STATUS_META,
  PAYMENT_METHODS,
} from '../lib/receivables'
import {
  buildCxcAccountRows,
  filterCxcAccounts,
  summarizeCxcAccounts,
  getAccountRowMeta,
} from '../lib/cxcAccounts'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { useSortedRows } from '@/hooks/useTableControls'
import { cn } from '@/lib/utils'

const METHOD_LABELS = {
  transferencia: { label: 'Transferencia', icon: ArrowLeftRight },
  link: { label: 'Link de pago', icon: Link2 },
  cxc: { label: 'Cta. por Cobrar', icon: Clock },
  efectivo: { label: 'Efectivo', icon: DollarSign },
  tarjeta: { label: 'Tarjeta', icon: ReceiptText },
  confirmado: { label: 'Confirmado', icon: CheckCircle2 },
  'cuenta-abierta': { label: 'Cuenta abierta', icon: FileText },
  retenida: { label: 'Venta retenida', icon: ShoppingBag },
  agenda: { label: 'Agenda', icon: CalendarDays },
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmtDateShort = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const FILTERS = [
  { id: 'open', label: 'Pendientes' },
  { id: 'cxc', label: 'CxC' },
  { id: 'open-quote', label: 'Cuentas abiertas' },
  { id: 'held', label: 'Retenidas' },
  { id: 'partial', label: 'Parciales' },
  { id: 'paid', label: 'Pagadas' },
  { id: 'all', label: 'Todas' },
]

function PaymentLog({ receivable }) {
  const payments = [...(receivable.payments || [])].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  )
  const total = payments.length

  if (!total) {
    return <p className="text-sm text-slate-500">Sin pagos registrados aún.</p>
  }

  return (
    <div className="space-y-2">
      {payments.map((p, i) => {
        const methodLabel = PAYMENT_METHODS.find((m) => m.id === p.method)?.label || p.method
        return (
          <div key={p.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">
                Pago {i + 1}{total > 1 ? ` de ${total}` : ''}
              </span>
              <span className="font-heading font-bold text-emerald-700">{formatDOP(p.amount)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {methodLabel}
              {p.reference ? ` · Ref. ${p.reference}` : ''}
              {' · '}
              {fmtDate(p.createdAt)}
            </p>
            {p.note && <p className="mt-1 text-xs text-slate-600">{p.note}</p>}
            {p.proof && (
              <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700">
                <Paperclip className="h-3 w-3" />
                {p.proof.name}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function CxcPage() {
  const navigate = useNavigate()
  const receivables = usePosStore((s) => s.receivables)
  const openQuotes = usePosStore((s) => s.openQuotes)
  const heldCarts = usePosStore((s) => s.heldCarts)
  const taxPct = usePosStore((s) => s.taxPct)
  const markPaid = usePosStore((s) => s.markReceivablePaid)
  const attachProof = usePosStore((s) => s.attachReceivableProof)
  const deleteReceivable = usePosStore((s) => s.deleteReceivable)
  const restoreHeldCart = usePosStore((s) => s.restoreHeldCart)
  const loadOpenQuoteToCart = usePosStore((s) => s.loadOpenQuoteToCart)
  const requestBill = usePosStore((s) => s.requestBill)
  const removeHeldCart = usePosStore((s) => s.removeHeldCart)
  const removeOpenQuote = usePosStore((s) => s.removeOpenQuote)

  const [filter, setFilter] = useState('open')
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [detail, setDetail] = useState(null)
  const [editRow, setEditRow] = useState(null)
  const [paymentRow, setPaymentRow] = useState(null)
  const [proofRow, setProofRow] = useState(null)

  const allRows = useMemo(
    () => buildCxcAccountRows({ receivables, openQuotes, heldCarts, taxPct }),
    [receivables, openQuotes, heldCarts, taxPct]
  )

  const filtered = useMemo(
    () => filterCxcAccounts(allRows, { filter, query, branchFilter }),
    [allRows, filter, query, branchFilter]
  )

  const summary = useMemo(() => summarizeCxcAccounts(allRows), [allRows])

  const { rows: displayRows, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'dueDate', dir: 'asc' },
    accessors: {
      id: (r) => r.id,
      customer: (r) => r.customer?.name || '',
      amount: (r) => r.amount || 0,
      paid: (r) => r.paid || 0,
      balance: (r) => r.balance || 0,
      kind: (r) => r.kind || '',
      dueDate: (r) => new Date(r.dueDate || r.createdAt || 0),
      status: (r) => r.status || '',
    },
  })

  const pendingTotal = summary.pendingTotal
  const openCount = summary.openCount
  const partialCount = summary.partialCount

  const closeDetailIfMatch = (r) => {
    if (detail?.id === r.id) setDetail(null)
  }

  const handleConfirm = (r, payload = {}) => {
    markPaid(r.id, 'confirmado', payload)
    toast.success(`Pago confirmado · ${formatDOP(r.balance)}`)
    closeDetailIfMatch(r)
  }

  const handleCash = (r, payload = {}) => {
    markPaid(r.id, 'efectivo', payload)
    toast.success(`Cobrado en efectivo · ${formatDOP(r.balance)} (a caja)`)
    closeDetailIfMatch(r)
  }

  const handleProofConfirm = (r, payload) => {
    handleConfirm(r, payload)
    setProofRow(null)
  }

  const handleProofCash = (r, payload) => {
    handleCash(r, payload)
    setProofRow(null)
  }

  const handleProofSaveOnly = (r, payload) => {
    attachProof(r.id, payload)
    toast.success('Comprobante guardado')
    setProofRow(null)
  }

  const handleDelete = (r) => {
    if (r.kind !== 'receivable') {
      const label = r.kind === 'open-quote' ? 'cuenta abierta' : 'venta retenida'
      if (!window.confirm(`¿Eliminar la ${label} de ${r.customer?.name}?`)) return
      if (r.kind === 'open-quote') {
        removeOpenQuote(r.customer?.id)
        removeHeldCart(r.id)
      } else {
        removeHeldCart(r.id)
      }
      toast.success('Cuenta eliminada')
      setDetail(null)
      return
    }
    if (!window.confirm(`¿Eliminar la cuenta de ${r.customer?.name}?`)) return
    deleteReceivable(r.id)
    toast.success('Cuenta eliminada')
    setDetail(null)
  }

  const handleOpenInPos = (r) => {
    if (r.kind === 'open-quote') {
      if (!loadOpenQuoteToCart(r.id)) restoreHeldCart(r.id)
    } else {
      restoreHeldCart(r.id)
    }
    navigate('/pos')
    toast.success('Cuenta cargada en el POS')
    setDetail(null)
  }

  const handleCollectInPos = (r) => {
    if (!loadOpenQuoteToCart(r.id)) restoreHeldCart(r.id)
    requestBill()
    navigate('/pos')
    toast.success('Lista para cobrar en el POS')
    setDetail(null)
  }

  const renderRowActions = (r) => {
    if (r.kind !== 'receivable') {
      return (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button type="button" title="Ver detalle" onClick={() => setDetail(r)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" data-testid={`cxc-detail-${r.id}`}>
            <Eye className="h-4 w-4" />
          </button>
          <button type="button" title="Abrir en POS" onClick={() => handleOpenInPos(r)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" data-testid={`cxc-open-pos-${r.id}`}>
            <ExternalLink className="h-4 w-4" />
          </button>
          {r.kind === 'open-quote' && (
            <button type="button" title="Pedir cuenta y cobrar" onClick={() => handleCollectInPos(r)} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50" data-testid={`cxc-collect-pos-${r.id}`}>
              <DollarSign className="h-4 w-4" />
            </button>
          )}
          <button type="button" title="Eliminar" onClick={() => handleDelete(r)} className="rounded-lg p-2 text-red-500 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    }

    return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <button type="button" title="Ver detalle" onClick={() => setDetail(r)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" data-testid={`cxc-detail-${r.id}`}>
        <Eye className="h-4 w-4" />
      </button>
      <button type="button" title="Editar" onClick={() => setEditRow(r)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
        <Pencil className="h-4 w-4" />
      </button>
      {r.status !== 'paid' && (
        <>
          <button type="button" title="Registrar pago" onClick={() => setPaymentRow(r)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50">
            <DollarSign className="h-4 w-4" />
          </button>
          <ReceivableCollectMenu
            row={r}
            onConfirm={handleConfirm}
            onCash={handleCash}
            onProof={setProofRow}
            testId={`cxc-mark-paid-${r.id}`}
          />
        </>
      )}
      <button type="button" title="Eliminar" onClick={() => handleDelete(r)} className="rounded-lg p-2 text-red-500 hover:bg-red-50">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5" data-testid="cxc-summary-total">
          <p className="text-sm text-slate-500">Total pendiente</p>
          <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{formatDOP(pendingTotal)}</p>
        </Card>
        <Card className="p-5" data-testid="cxc-summary-count">
          <p className="text-sm text-slate-500">Cuentas pendientes</p>
          <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{openCount}</p>
          <p className="mt-1 text-xs text-slate-400">
            {summary.cxcCount} CxC · {summary.openQuoteCount} abiertas · {summary.heldCount} retenidas
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Cuentas abiertas</p>
          <p className="mt-1 font-heading text-2xl font-bold text-blue-600">{summary.openQuoteCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Pagos parciales (CxC)</p>
          <p className="mt-1 font-heading text-2xl font-bold text-amber-600">{partialCount}</p>
        </Card>
      </div>

      <DataFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Buscar por cliente o ID..."
        showBranch
        branchId={branchFilter}
        onBranchChange={setBranchFilter}
        testId="cxc-filters"
        extra={
          <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-100 bg-white p-1 shadow-soft">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                data-testid={`cxc-filter-${f.id}`}
                className={cn(
                  'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                  filter === f.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      <AnimatedTabPanel panelKey={`${filter}-${query}-${branchFilter}`}>
      {filtered.length === 0 ? (
        <Card className="overflow-hidden">
          <EmptyState icon={CheckCircle2} title="Nada por aquí" description="No hay cuentas en este filtro." className="py-14" />
        </Card>
      ) : (
        <ResponsiveList minTableWidth={1100} columnCount={9}>
          <ResponsiveTable testId="cxc-table">
            <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <SortableTh column="id" className="px-4 py-3">ID</SortableTh>
                  <SortableTh column="kind" className="px-4 py-3">Tipo</SortableTh>
                  <SortableTh column="customer" className="px-4 py-3">Cliente</SortableTh>
                  <SortableTh column="amount" align="right" className="px-4 py-3">Total</SortableTh>
                  <SortableTh column="paid" align="right" className="px-4 py-3">Pagado</SortableTh>
                  <SortableTh column="balance" align="right" className="px-4 py-3">Pendiente</SortableTh>
                  <SortableTh column="dueDate" className="px-4 py-3">Vencimiento</SortableTh>
                  <SortableTh column="status" className="px-4 py-3">Estado</SortableTh>
                  <SortableTh sortable={false} align="right" className="px-4 py-3">Acciones</SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayRows.map((r) => {
                  const meta = getAccountRowMeta(r)
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60" data-testid={`cxc-row-${r.id}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.id.slice(-12)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{r.customer?.name || 'Cliente'}</span>
                          {r.proof && (
                            <span title={`Comprobante: ${r.proof.name}`} className="text-emerald-600">
                              <Paperclip className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatDOP(r.amount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{formatDOP(r.paid)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatDOP(r.balance)}</td>
                      <td className="px-4 py-3 text-slate-500">{fmtDateShort(r.dueDate)}</td>
                      <td className="px-4 py-3">
                        {r.kind === 'receivable' ? (
                          <>
                            <Badge tone={STATUS_META[r.status]?.tone || 'neutral'}>
                              {STATUS_META[r.status]?.label || r.status}
                            </Badge>
                            {r.payments?.length > 0 && r.status !== 'paid' && (
                              <p className="mt-1 text-[10px] text-slate-400">{r.payments.length} pago{r.payments.length > 1 ? 's' : ''}</p>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">{r.reference}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {renderRowActions(r)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="cxc-cards">
            {displayRows.map((r) => {
              const meta = getAccountRowMeta(r)
              return (
                <MobileCard key={r.id} testId={`cxc-card-${r.id}`}>
                  <MobileCardHeader
                    title={r.customer?.name || 'Cliente'}
                    subtitle={r.id.slice(-12)}
                    badge={<Badge tone={meta.tone}>{meta.label}</Badge>}
                  />
                  <MobileCardGrid>
                    <MobileField label="Total">{formatDOP(r.amount)}</MobileField>
                    <MobileField label="Pagado"><span className="text-emerald-600">{formatDOP(r.paid)}</span></MobileField>
                    <MobileField label="Pendiente"><span className="font-semibold">{formatDOP(r.balance)}</span></MobileField>
                    <MobileField label="Vencimiento">{fmtDateShort(r.dueDate)}</MobileField>
                  </MobileCardGrid>
                  <MobileCardFooter>{renderRowActions(r)}</MobileCardFooter>
                </MobileCard>
              )
            })}
          </ResponsiveCards>
        </ResponsiveList>
      )}
      </AnimatedTabPanel>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle de cuenta" wide testId="cxc-detail-modal">
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">Cliente</p>
                <p className="font-heading text-lg font-bold text-slate-900">{detail.customer?.name}</p>
                <p className="mt-1 font-mono text-xs text-slate-400">{detail.id}</p>
                <div className="mt-2">
                  <Badge tone={getAccountRowMeta(detail).tone}>{getAccountRowMeta(detail).label}</Badge>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-semibold">{formatDOP(detail.amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Pagado</span><span className="font-semibold text-emerald-600">{formatDOP(detail.kind === 'receivable' ? getPaidAmount(detail) : 0)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-medium">Saldo pendiente</span><span className="font-bold text-red-600">{formatDOP(detail.kind === 'receivable' ? getBalance(detail) : detail.balance)}</span></div>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between sm:block">
                <dt className="text-slate-500">Origen</dt>
                <dd className="font-medium">
                  {(METHOD_LABELS[detail.source === 'agenda' ? 'agenda' : detail.method] || METHOD_LABELS.cxc).label}
                </dd>
              </div>
              <div className="flex justify-between sm:block"><dt className="text-slate-500">Referencia</dt><dd className="font-medium">{detail.reference || '—'}</dd></div>
              {detail.appointmentId && (
                <div className="flex justify-between sm:block sm:col-span-2">
                  <dt className="text-slate-500">Cita vinculada</dt>
                  <dd className="font-mono text-xs font-medium text-slate-700">{detail.appointmentId}</dd>
                </div>
              )}
              <div className="flex justify-between sm:block"><dt className="text-slate-500">Creada</dt><dd className="font-medium">{fmtDate(detail.createdAt)}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-slate-500">Actualizada</dt><dd className="font-medium">{fmtDateShort(detail.dueDate)}</dd></div>
            </dl>

            {detail.proof && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <Paperclip className="h-4 w-4 shrink-0" />
                <span>
                  Comprobante adjunto: <span className="font-semibold">{detail.proof.name}</span>
                </span>
              </div>
            )}

            {detail.notes && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{detail.notes}</div>
            )}

            {detail.items?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Artículos</p>
                <ul className="space-y-1.5">
                  {detail.items.map((it, i) => (
                    <li key={i} className="flex justify-between text-sm text-slate-600">
                      <span>{it.qty}× {it.name}</span>
                      <span className="font-medium">{formatDOP(it.price * (it.qty || 1))}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.kind === 'receivable' && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <History className="h-4 w-4 text-blue-600" />
                  <h4 className="font-heading font-semibold text-slate-900">Historial de pagos</h4>
                </div>
                <PaymentLog receivable={detail} />
              </div>
            )}

            {detail.kind === 'receivable' && getReceivableStatus(detail) !== 'paid' && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => { setEditRow(detail); setDetail(null) }}>Editar</Button>
                  <Button variant="secondary" onClick={() => { setPaymentRow(detail); setDetail(null) }}>
                    <DollarSign className="h-4 w-4" />
                    Registrar pago
                  </Button>
                  <Button variant="secondary" onClick={() => setProofRow(detail)}>
                    <Upload className="h-4 w-4" />
                    Validar con comprobante
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="secondary" onClick={() => handleConfirm(detail)} data-testid="cxc-modal-confirm">
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar pago
                  </Button>
                  <Button onClick={() => handleCash(detail)} data-testid="cxc-modal-cash">
                    <Banknote className="h-4 w-4" />
                    Cobrar en efectivo
                  </Button>
                </div>
              </div>
            )}

            {detail.kind !== 'receivable' && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <Button onClick={() => handleOpenInPos(detail)} data-testid="cxc-modal-open-pos">
                  <ExternalLink className="h-4 w-4" />
                  Abrir en POS
                </Button>
                {detail.kind === 'open-quote' && (
                  <Button variant="secondary" onClick={() => handleCollectInPos(detail)} data-testid="cxc-modal-collect-pos">
                    <DollarSign className="h-4 w-4" />
                    Pedir cuenta y cobrar
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ReceivableEditModal open={!!editRow && editRow.kind === 'receivable'} onClose={() => setEditRow(null)} receivable={editRow?.kind === 'receivable' ? editRow : null} />
      <ReceivablePaymentModal open={!!paymentRow && paymentRow.kind === 'receivable'} onClose={() => setPaymentRow(null)} receivable={paymentRow?.kind === 'receivable' ? paymentRow : null} />
      <ReceivableProofModal
        open={!!proofRow && proofRow.kind === 'receivable'}
        onClose={() => setProofRow(null)}
        receivable={proofRow?.kind === 'receivable' ? proofRow : null}
        onConfirm={handleProofConfirm}
        onCash={handleProofCash}
        onSaveOnly={handleProofSaveOnly}
      />
    </div>
  )
}
