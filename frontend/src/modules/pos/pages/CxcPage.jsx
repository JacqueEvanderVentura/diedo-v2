import { useState, useMemo } from 'react'
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
  getBalance,
  getPaidAmount,
  getReceivableStatus,
  STATUS_META,
  PAYMENT_METHODS,
} from '../lib/receivables'
import { cn } from '@/lib/utils'

const METHOD_LABELS = {
  transferencia: { label: 'Transferencia', icon: ArrowLeftRight },
  link: { label: 'Link de pago', icon: Link2 },
  cxc: { label: 'Cta. por Cobrar', icon: Clock },
  efectivo: { label: 'Efectivo', icon: DollarSign },
  tarjeta: { label: 'Tarjeta', icon: ReceiptText },
  confirmado: { label: 'Confirmado', icon: CheckCircle2 },
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
  const receivables = usePosStore((s) => s.receivables)
  const markPaid = usePosStore((s) => s.markReceivablePaid)
  const attachProof = usePosStore((s) => s.attachReceivableProof)
  const deleteReceivable = usePosStore((s) => s.deleteReceivable)
  const getPendingTotal = usePosStore((s) => s.getPendingTotal)

  const [filter, setFilter] = useState('open')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState(null)
  const [editRow, setEditRow] = useState(null)
  const [paymentRow, setPaymentRow] = useState(null)
  const [proofRow, setProofRow] = useState(null)

  const enriched = useMemo(
    () => receivables.map((r) => ({ ...r, status: getReceivableStatus(r), balance: getBalance(r), paid: getPaidAmount(r) })),
    [receivables]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return enriched.filter((r) => {
      const status = r.status
      if (filter === 'open' && status === 'paid') return false
      if (filter === 'partial' && status !== 'partial') return false
      if (filter === 'paid' && status !== 'paid') return false
      if (!q) return true
      return r.customer?.name?.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.reference?.toLowerCase().includes(q)
    })
  }, [enriched, filter, query])

  const pendingTotal = getPendingTotal()
  const openCount = enriched.filter((r) => r.status !== 'paid').length
  const partialCount = enriched.filter((r) => r.status === 'partial').length

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
    if (!window.confirm(`¿Eliminar la cuenta de ${r.customer?.name}?`)) return
    deleteReceivable(r.id)
    toast.success('Cuenta eliminada')
    setDetail(null)
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5" data-testid="cxc-summary-total">
          <p className="text-sm text-slate-500">Total pendiente</p>
          <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{formatDOP(pendingTotal)}</p>
        </Card>
        <Card className="p-5" data-testid="cxc-summary-count">
          <p className="text-sm text-slate-500">Cuentas abiertas</p>
          <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{openCount}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Pagos parciales</p>
          <p className="mt-1 font-heading text-2xl font-bold text-amber-600">{partialCount}</p>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente o ID..."
            className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
          />
        </div>
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
      </div>

      <AnimatedTabPanel panelKey={`${filter}-${query}`}>
      <Card className="overflow-hidden" data-testid="cxc-table">
        {filtered.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nada por aquí" description="No hay cuentas en este estado." className="py-14" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3 text-right">Pendiente</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status]
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60" data-testid={`cxc-row-${r.id}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.id.slice(-12)}</td>
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
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {r.payments?.length > 0 && r.status !== 'paid' && (
                          <p className="mt-1 text-[10px] text-slate-400">{r.payments.length} pago{r.payments.length > 1 ? 's' : ''}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
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
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </AnimatedTabPanel>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle de cuenta por cobrar" wide testId="cxc-detail-modal">
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">Cliente</p>
                <p className="font-heading text-lg font-bold text-slate-900">{detail.customer?.name}</p>
                <p className="mt-1 font-mono text-xs text-slate-400">{detail.id}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-semibold">{formatDOP(detail.amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Pagado</span><span className="font-semibold text-emerald-600">{formatDOP(getPaidAmount(detail))}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-medium">Saldo pendiente</span><span className="font-bold text-red-600">{formatDOP(getBalance(detail))}</span></div>
              </div>
            </div>

            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between sm:block"><dt className="text-slate-500">Método origen</dt><dd className="font-medium">{(METHOD_LABELS[detail.method] || METHOD_LABELS.cxc).label}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-slate-500">Referencia</dt><dd className="font-medium">{detail.reference || '—'}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-slate-500">Creada</dt><dd className="font-medium">{fmtDate(detail.createdAt)}</dd></div>
              <div className="flex justify-between sm:block"><dt className="text-slate-500">Vencimiento</dt><dd className="font-medium">{fmtDateShort(detail.dueDate)}</dd></div>
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

            <div>
              <div className="mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-blue-600" />
                <h4 className="font-heading font-semibold text-slate-900">Historial de pagos</h4>
              </div>
              <PaymentLog receivable={detail} />
            </div>

            {getReceivableStatus(detail) !== 'paid' && (
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
          </div>
        )}
      </Modal>

      <ReceivableEditModal open={!!editRow} onClose={() => setEditRow(null)} receivable={editRow} />
      <ReceivablePaymentModal open={!!paymentRow} onClose={() => setPaymentRow(null)} receivable={paymentRow} />
      <ReceivableProofModal
        open={!!proofRow}
        onClose={() => setProofRow(null)}
        receivable={proofRow}
        onConfirm={handleProofConfirm}
        onCash={handleProofCash}
        onSaveOnly={handleProofSaveOnly}
      />
    </div>
  )
}
