import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Phone,
  Mail,
  ShoppingBag,
  CalendarClock,
  CalendarDays,
  Pencil,
  CalendarPlus,
  Building2,
  FileText,
  Briefcase,
  CheckSquare,
} from 'lucide-react'
import { WhatsAppMenuButton } from '@/components/ui/WhatsAppMenuButton'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { usePosStore } from '@/stores/posStore'
import { useCrmStore } from '@/stores/crmStore'
import { useAgendaStore, statusMeta, todayKey } from '@/stores/agendaStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { ACQUISITION_SOURCE_LABELS, QUOTE_STATUS_META, STAGE_META } from '@/data/crm'
import { buildCustomerWhatsAppVariables } from '@/lib/whatsappVariables'
import { fmtDate, fmtDateTime, METHOD_LABELS } from '../lib/crm'
import {
  filterCustomerQuotes,
  filterOpenOpportunities,
  filterPendingActivities,
  mergeSalesForCustomer,
} from '../lib/customerContext'

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      {children}
    </div>
  )
}

export function CustomerDetailModal({
  open,
  onClose,
  customer,
  onEdit,
  onSchedule,
  onQuote,
  onNewTask,
  onNewOpportunity,
  onOpenSale,
}) {
  const posSales = usePosStore((s) => s.sales)
  const crmSales = useCrmStore((s) => s.sales)
  const opportunities = useCrmStore((s) => s.opportunities)
  const quotes = useCrmStore((s) => s.quotes)
  const activities = useCrmStore((s) => s.activities)
  const appointments = useAgendaStore((s) => s.appointments)
  const agendaResources = useAgendaStore((s) => s.resources)
  const branches = useConfigStore((s) => s.branches)

  const assignedBranchIds = customer?.branchIds?.length
    ? customer.branchIds
    : customer?.branchId
      ? [customer.branchId]
      : []
  const assignedBranches = assignedBranchIds
    .map((branchId) => branches.find((branch) => branch.id === branchId))
    .filter(Boolean)

  const purchases = useMemo(
    () => (customer ? mergeSalesForCustomer(posSales, crmSales, customer.id) : []),
    [posSales, crmSales, customer],
  )
  const totalSpent = useMemo(() => purchases.reduce((a, s) => a + (s.total || 0), 0), [purchases])
  const openOpportunities = useMemo(
    () => (customer ? filterOpenOpportunities(opportunities, customer.id) : []),
    [opportunities, customer],
  )
  const customerQuotes = useMemo(
    () => (customer ? filterCustomerQuotes(quotes, customer.id) : []),
    [quotes, customer],
  )
  const pendingTasks = useMemo(
    () => (customer ? filterPendingActivities(activities, customer.id) : []),
    [activities, customer],
  )
  const upcoming = useMemo(
    () =>
      customer
        ? appointments.filter((a) => a.customerId === customer.id && a.date >= todayKey()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        : [],
    [appointments, customer],
  )
  const pastAppointments = useMemo(
    () =>
      customer
        ? appointments.filter((a) => a.customerId === customer.id && a.date < todayKey()).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
        : [],
    [appointments, customer],
  )

  return (
    <Modal open={open} onClose={onClose} title="Ficha de cliente" wide testId="customer-detail-modal">
      {customer && (
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
              {customer.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-lg font-bold text-slate-900" data-testid="customer-detail-name">{customer.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                {customer.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {customer.phone}</span>}
                {customer.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {customer.email}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {customer.phone && (
                <WhatsAppMenuButton
                  phone={customer.phone}
                  context="clientes"
                  size="sm"
                  variables={buildCustomerWhatsAppVariables(customer, appointments, agendaResources)}
                  data-testid="customer-detail-wa"
                />
              )}
              <Button size="sm" variant="secondary" onClick={() => onEdit(customer)} data-testid="customer-detail-edit">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" data-testid="customer-detail-actions">
            <Button size="sm" variant="secondary" onClick={() => onQuote?.(customer)}>
              <FileText className="h-3.5 w-3.5" /> Cotizar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onNewOpportunity?.(customer)}>
              <Briefcase className="h-3.5 w-3.5" /> Oportunidad
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onNewTask?.(customer)}>
              <CheckSquare className="h-3.5 w-3.5" /> Tarea
            </Button>
            <Button size="sm" onClick={() => onSchedule(customer)} data-testid="customer-detail-schedule">
              <CalendarPlus className="h-3.5 w-3.5" /> Cita
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-medium text-slate-400">Total gastado</p>
              <p className="font-heading text-xl font-bold text-blue-600" data-testid="customer-detail-total">{formatDOP(totalSpent)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-medium text-slate-400">Compras</p>
              <p className="font-heading text-xl font-bold text-slate-800">{purchases.length}</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-medium text-slate-400">Pipeline</p>
              <p className="font-heading text-xl font-bold text-emerald-600">{openOpportunities.length}</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-medium text-slate-400">Tareas pendientes</p>
              <p className="font-heading text-xl font-bold text-amber-600">{pendingTasks.length}</p>
            </div>
          </div>

          <Section title="Clasificación y sucursales">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
              <Badge tone="neutral">
                {customer.customerType === 'b2b' ? 'Empresa (B2B)' : 'Consumidor (B2C)'}
              </Badge>
              {customer.acquisitionSource && (
                <Badge tone="brand">
                  {ACQUISITION_SOURCE_LABELS[customer.acquisitionSource] || customer.acquisitionSource}
                </Badge>
              )}
              {assignedBranches.map((branch) => (
                <Badge key={branch.id} tone="brand">
                  <Building2 className="mr-1 h-3 w-3" /> {branch.name}
                </Badge>
              ))}
              {assignedBranches.length === 0 && (
                <span className="text-sm text-slate-400">Sin sucursales asignadas</span>
              )}
              {customer.customerType === 'b2b' && customer.company && (
                <p className="w-full pt-1 text-sm text-slate-600">
                  Razón social: <span className="font-semibold text-slate-700">{customer.company}</span>
                </p>
              )}
            </div>
          </Section>

          {customer.notes && (
            <Section title="Notas">
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{customer.notes}</p>
            </Section>
          )}

          <Section title="Oportunidades abiertas">
            {openOpportunities.length === 0 ? (
              <p className="text-sm text-slate-400">Sin deals activos en el pipeline.</p>
            ) : (
              <ul className="space-y-2" data-testid="customer-detail-opportunities">
                {openOpportunities.map((opp) => (
                  <li key={opp.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{opp.title}</p>
                      <p className="text-xs text-slate-500">{formatDOP(opp.value || 0)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={STAGE_META[opp.stage]?.tone || 'neutral'}>
                        {STAGE_META[opp.stage]?.label || opp.stage}
                      </Badge>
                      <Link to="/crm/pipeline" className="text-xs font-semibold text-blue-600 hover:underline">
                        Pipeline
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Cotizaciones recientes">
            {customerQuotes.length === 0 ? (
              <p className="text-sm text-slate-400">Aún no hay cotizaciones para este cliente.</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-y-auto scrollbar-thin" data-testid="customer-detail-quotes">
                {customerQuotes.slice(0, 5).map((quote) => (
                  <li key={quote.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
                    <div>
                      <p className="font-mono text-xs text-slate-500">{quote.number}</p>
                      <p className="font-medium text-slate-800">{formatDOP(quote.total)}</p>
                    </div>
                    <Badge tone={QUOTE_STATUS_META[quote.status]?.tone || 'neutral'}>
                      {QUOTE_STATUS_META[quote.status]?.label || quote.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Tareas pendientes">
            {pendingTasks.length === 0 ? (
              <p className="text-sm text-slate-400">Sin seguimientos pendientes.</p>
            ) : (
              <ul className="space-y-2" data-testid="customer-detail-tasks">
                {pendingTasks.slice(0, 5).map((task) => (
                  <li key={task.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                    <p className="font-medium text-slate-800">{task.title}</p>
                    <p className="text-xs text-slate-500">{fmtDateTime(task.dueAt || task.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

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

          <Section title="Historial de citas">
            {pastAppointments.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-slate-400"><CalendarDays className="h-4 w-4" /> Sin citas anteriores</p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto scrollbar-thin" data-testid="customer-detail-past-appointments">
                {pastAppointments.map((a) => {
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

          <Section title="Historial de compras">
            {purchases.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-slate-400"><ShoppingBag className="h-4 w-4" /> Aún sin compras registradas</p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto scrollbar-thin" data-testid="customer-detail-purchases">
                {purchases.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onOpenSale?.(s)}
                      className="w-full rounded-xl border border-slate-100 p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                      data-testid={`customer-detail-sale-${s.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">{fmtDateTime(s.createdAt)}</span>
                        <span className="font-heading font-bold text-slate-900">{formatDOP(s.total)}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-600">
                        {s.items?.map((i) => `${i.qty}× ${i.name}`).join(', ') || s.number || 'Venta'}
                      </p>
                      <span className="mt-1 inline-block text-[11px] font-medium text-slate-400">
                        {METHOD_LABELS[s.method] || s.method}
                        {s.origin === 'pipeline' ? ' · Pipeline' : ''}
                      </span>
                    </button>
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
