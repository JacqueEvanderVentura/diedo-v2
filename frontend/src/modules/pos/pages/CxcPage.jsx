import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { ReceiptText, ArrowLeftRight, Link2, Clock, CheckCircle2, Banknote } from 'lucide-react'
import { usePosStore } from '@/stores/posStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'

const METHOD_LABELS = {
  transferencia: { label: 'Transferencia', icon: ArrowLeftRight },
  link: { label: 'Link de pago', icon: Link2 },
  cxc: { label: 'Cta. por Cobrar', icon: Clock },
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtDate = (iso) => {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`
}

const FILTERS = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'paid', label: 'Cobradas' },
  { id: 'all', label: 'Todas' },
]

export default function CxcPage() {
  const receivables = usePosStore((s) => s.receivables)
  const markPaid = usePosStore((s) => s.markReceivablePaid)
  const [filter, setFilter] = useState('pending')
  const [detail, setDetail] = useState(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return receivables
    return receivables.filter((r) => r.status === filter)
  }, [receivables, filter])

  const pendingTotal = receivables.filter((r) => r.status === 'pending').reduce((a, r) => a + r.amount, 0)
  const pendingCount = receivables.filter((r) => r.status === 'pending').length

  const handleMark = (r, method) => {
    markPaid(r.id, method)
    toast.success(`Cobro registrado · ${formatDOP(r.amount)} (${method === 'efectivo' ? 'efectivo a caja' : 'confirmado'})`)
    setDetail(null)
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-6 sm:p-8">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card className="flex items-center gap-4 p-6" data-testid="cxc-summary-total">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <ReceiptText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total pendiente por cobrar</p>
            <p className="font-heading text-3xl font-bold tracking-tight text-slate-900">{formatDOP(pendingTotal)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-6" data-testid="cxc-summary-count">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Cuentas pendientes</p>
            <p className="font-heading text-3xl font-bold tracking-tight text-slate-900">{pendingCount}</p>
          </div>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1 self-start overflow-x-auto scrollbar-hide rounded-xl border border-slate-100 bg-white p-1 shadow-soft w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            data-testid={`cxc-filter-${f.id}`}
            className={cn(
              'whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,color] duration-200',
              filter === f.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden" data-testid="cxc-table">
        {filtered.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nada por aquí" description="No hay cuentas en este estado." className="py-14" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Método</th>
                  <th className="px-6 py-4">Referencia</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => {
                  const M = METHOD_LABELS[r.method] || METHOD_LABELS.cxc
                  const Icon = M.icon
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50/60" data-testid={`cxc-row-${r.id}`}>
                      <td className="px-6 py-4">
                        <button onClick={() => setDetail(r)} className="whitespace-nowrap text-left font-semibold text-slate-800 hover:text-blue-600" data-testid={`cxc-detail-${r.id}`}>
                          {r.customer?.name || 'Cliente'}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-600"><Icon className="h-4 w-4 text-slate-400" /> {M.label}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{r.reference || '—'}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500">{fmtDate(r.createdAt)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-heading font-bold text-slate-900">{formatDOP(r.amount)}</td>
                      <td className="px-6 py-4">
                        {r.status === 'pending' ? <Badge tone="warning">Pendiente</Badge> : <Badge tone="success">Cobrada</Badge>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {r.status === 'pending' ? (
                          <Button size="sm" onClick={() => handleMark(r, 'confirmado')} data-testid={`cxc-mark-paid-${r.id}`}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Marcar cobrado
                          </Button>
                        ) : (
                          <span className="whitespace-nowrap text-xs font-medium text-emerald-600">{r.paidAt ? fmtDate(r.paidAt) : 'Cobrada'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle de cuenta por cobrar" testId="cxc-detail-modal">
        {detail && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Cliente</p>
              <p className="font-heading text-lg font-bold text-slate-900">{detail.customer?.name}</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Método</dt><dd className="font-medium text-slate-700">{(METHOD_LABELS[detail.method] || METHOD_LABELS.cxc).label}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Referencia</dt><dd className="font-medium text-slate-700">{detail.reference || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Fecha</dt><dd className="font-medium text-slate-700">{fmtDate(detail.createdAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Estado</dt><dd>{detail.status === 'pending' ? <Badge tone="warning">Pendiente</Badge> : <Badge tone="success">Cobrada</Badge>}</dd></div>
            </dl>
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
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-heading text-base font-bold text-slate-900">Monto</span>
              <span className="font-heading text-2xl font-bold text-blue-600">{formatDOP(detail.amount)}</span>
            </div>
            {detail.status === 'pending' && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button variant="secondary" onClick={() => handleMark(detail, 'confirmado')} data-testid="cxc-modal-confirm">
                  <CheckCircle2 className="h-4 w-4" /> Confirmar pago
                </Button>
                <Button onClick={() => handleMark(detail, 'efectivo')} data-testid="cxc-modal-cash">
                  <Banknote className="h-4 w-4" /> Cobrar en efectivo
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
