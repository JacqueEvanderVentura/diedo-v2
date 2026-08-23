import { useMemo } from 'react'
import { Phone, Mail, Star, ShoppingBag, CalendarClock, Pencil } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { usePosStore } from '@/stores/posStore'
import { useAgendaStore, statusMeta, todayKey } from '@/stores/agendaStore'
import { formatDOP } from '@/lib/format'
import { fmtDate, fmtDateTime, METHOD_LABELS } from '../lib/crm'

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      {children}
    </div>
  )
}

export function CustomerDetailModal({ open, onClose, customer, onEdit }) {
  const sales = usePosStore((s) => s.sales)
  const appointments = useAgendaStore((s) => s.appointments)

  const purchases = useMemo(
    () => (customer ? sales.filter((s) => s.customer?.id === customer.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : []),
    [sales, customer]
  )
  const totalSpent = useMemo(() => purchases.reduce((a, s) => a + (s.total || 0), 0), [purchases])
  const upcoming = useMemo(
    () =>
      customer
        ? appointments.filter((a) => a.customerId === customer.id && a.date >= todayKey()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        : [],
    [appointments, customer]
  )

  return (
    <Modal open={open} onClose={onClose} title="Ficha de cliente" testId="customer-detail-modal">
      {customer && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
              {customer.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-lg font-bold text-slate-900" data-testid="customer-detail-name">{customer.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                {customer.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {customer.phone}</span>}
                {customer.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {customer.email}</span>}
                <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" /> {customer.points ?? 0} pts</span>
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onEdit(customer)} data-testid="customer-detail-edit">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-medium text-slate-400">Total gastado</p>
              <p className="font-heading text-xl font-bold text-blue-600" data-testid="customer-detail-total">{formatDOP(totalSpent)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-medium text-slate-400">Compras</p>
              <p className="font-heading text-xl font-bold text-slate-800">{purchases.length}</p>
            </div>
          </div>

          {customer.notes && (
            <Section title="Notas">
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{customer.notes}</p>
            </Section>
          )}

          {/* Upcoming appointments */}
          <Section title="Próximas citas">
            {upcoming.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-slate-400"><CalendarClock className="h-4 w-4" /> Sin citas próximas</p>
            ) : (
              <ul className="space-y-2" data-testid="customer-detail-appointments">
                {upcoming.map((a) => {
                  const st = statusMeta(a.status)
                  return (
                    <li key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
                      <span className="text-slate-700">{fmtDate(a.date)} · {a.time} · {a.serviceName || 'Sin servicio'}</span>
                      <Badge tone={st.tone}>{st.name}</Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {/* Purchase history */}
          <Section title="Historial de compras">
            {purchases.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-slate-400"><ShoppingBag className="h-4 w-4" /> Aún sin compras registradas</p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto scrollbar-thin" data-testid="customer-detail-purchases">
                {purchases.map((s) => (
                  <li key={s.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{fmtDateTime(s.createdAt)}</span>
                      <span className="font-heading font-bold text-slate-900">{formatDOP(s.total)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600">
                      {s.items?.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                    </p>
                    <span className="mt-1 inline-block text-[11px] font-medium text-slate-400">{METHOD_LABELS[s.method] || s.method}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </Modal>
  )
}
