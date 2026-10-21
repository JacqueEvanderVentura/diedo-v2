import { useCrmCapabilities } from '@/modules/crm/hooks/useCrmCapabilities'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Phone,
  Mail,
  Instagram,
  ShoppingBag,
  CalendarClock,
  CalendarDays,
  Pencil,
  Trash2,
  CalendarPlus,
  Building2,
  FileText,
  CheckSquare,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { fmtDate, fmtDateTime, METHOD_LABELS, saleStatusBadge } from '../lib/crm'
import { resolveInstagramUrl } from '../lib/simplifiedOffer'
import {
  filterCustomerQuotes,
  filterOpenPipelineLeads,
  filterPendingActivities,
  mergeSalesForCustomer,
} from '../lib/customerContext'

function Section({ title, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

const detailRowClass = (interactive, className) => cn(
  'group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 p-4 text-left text-sm transition-colors',
  interactive && 'cursor-pointer hover:border-blue-200 hover:bg-blue-50/40',
  className,
)

function DetailRowButton({ onClick, to, children, testId, className }) {
  const interactive = Boolean(onClick || to)
  const body = (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {interactive && (
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-blue-500" aria-hidden />
      )}
    </>
  )
  if (to) {
    return (
      <Link to={to} data-testid={testId} className={detailRowClass(true, className)}>
        {body}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      data-testid={testId}
      className={detailRowClass(interactive, className)}
    >
      {body}
    </button>
  )
}

export function CustomerDetailPanel({
  customer,
  onEdit,
  onDelete,
  onSchedule,
  onQuote,
  onNewTask,
  onOpenSale,
  onOpenQuote,
  onOpenTask,
  onOpenAppointment,
  onOpenLead,
}) {
  const can = useCrmCapabilities()
  const posSales = usePosStore((s) => s.sales)
  const crmSales = useCrmStore((s) => s.sales)
  const leads = useCrmStore((s) => s.leads)
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

  const receivables = usePosStore((s) => s.receivables)
  const purchases = useMemo(
    () => (customer ? mergeSalesForCustomer(posSales, crmSales, customer.id) : []),
    [posSales, crmSales, customer],
  )
  const activePurchases = purchases.filter((sale) => sale.status !== 'voided')
  const totalSpent = activePurchases.reduce((sum, sale) => sum + (sale.total || 0), 0)
  const openPipelineLeads = useMemo(
    () => (customer ? filterOpenPipelineLeads(leads, customer.id) : []),
    [leads, customer],
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

  if (!customer) return null

  return (
    <div className="space-y-6" data-testid="customer-detail-panel">
          <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
              {customer.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-lg font-bold text-slate-900" data-testid="customer-detail-name">{customer.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                {customer.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {customer.phone}</span>}
                {customer.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {customer.email}</span>}
                {resolveInstagramUrl(customer) && (
                  <a href={resolveInstagramUrl(customer)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline" data-testid="customer-detail-instagram">
                    <Instagram className="h-3 w-3" /> IG
                  </a>
                )}
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
              <Button size="sm" variant="secondary" disabled={!can.customer} onClick={() => onEdit(customer)} data-testid="customer-detail-edit">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              {onDelete && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!can.customer}
                  onClick={() => onDelete(customer)}
                  data-testid="customer-detail-delete"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2" data-testid="customer-detail-actions">
            <Button size="sm" variant="secondary" disabled={!can.quote} onClick={() => onQuote?.(customer)}>
              <FileText className="h-3.5 w-3.5" /> Cotizar
            </Button>
            <Button size="sm" variant="secondary" disabled={!can.manage} onClick={() => onNewTask?.(customer)}>
              <CheckSquare className="h-3.5 w-3.5" /> Tarea
            </Button>
            <Button size="sm" disabled={!can.schedule || !onSchedule} onClick={() => onSchedule?.(customer)} data-testid="customer-detail-schedule">
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
              <p className="font-heading text-xl font-bold text-slate-800">{activePurchases.length}</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-medium text-slate-400">Pipeline</p>
              <p className="font-heading text-xl font-bold text-emerald-600">{openPipelineLeads.length}</p>
            </div>
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="text-xs font-medium text-slate-400">Tareas pendientes</p>
              <p className="font-heading text-xl font-bold text-amber-600">{pendingTasks.length}</p>
            </div>
          </div>

          <Section title="Clasificación y sucursales">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-4">
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
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{customer.notes}</p>
            </Section>
          )}

          <Section title="Leads en pipeline">
            {openPipelineLeads.length === 0 ? (
              <p className="py-2 text-sm text-slate-400">Sin leads activos en el pipeline.</p>
            ) : (
              <ul className="space-y-3" data-testid="customer-detail-pipeline-leads">
                {openPipelineLeads.map((pipelineLead) => (
                  <li key={pipelineLead.id}>
                    <DetailRowButton
                      to={onOpenLead ? undefined : '/crm/pipeline'}
                      onClick={onOpenLead ? () => onOpenLead(pipelineLead) : undefined}
                      testId={`customer-detail-lead-${pipelineLead.id}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-800">{pipelineLead.company || pipelineLead.name}</p>
                          <p className="text-xs text-slate-500">{formatDOP(pipelineLead.pipelineValue || 0)}</p>
                        </div>
                        <Badge tone={STAGE_META[pipelineLead.status]?.tone || 'neutral'}>
                          {STAGE_META[pipelineLead.status]?.label || pipelineLead.status}
                        </Badge>
                      </div>
                    </DetailRowButton>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Cotizaciones recientes">
            {customerQuotes.length === 0 ? (
              <p className="py-2 text-sm text-slate-400">Aún no hay cotizaciones para este cliente.</p>
            ) : (
              <ul className="max-h-60 space-y-3 overflow-y-auto scrollbar-thin" data-testid="customer-detail-quotes">
                {customerQuotes.slice(0, 5).map((quote) => (
                  <li key={quote.id}>
                    <DetailRowButton
                      onClick={onOpenQuote ? () => onOpenQuote(quote) : undefined}
                      testId={`customer-detail-quote-${quote.id}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-mono text-xs text-slate-500">{quote.number}</p>
                          <p className="font-medium text-slate-800">{formatDOP(quote.total)}</p>
                        </div>
                        <Badge tone={QUOTE_STATUS_META[quote.status]?.tone || 'neutral'}>
                          {QUOTE_STATUS_META[quote.status]?.label || quote.status}
                        </Badge>
                      </div>
                    </DetailRowButton>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Tareas pendientes">
            {pendingTasks.length === 0 ? (
              <p className="py-2 text-sm text-slate-400">Sin seguimientos pendientes.</p>
            ) : (
              <ul className="space-y-3" data-testid="customer-detail-tasks">
                {pendingTasks.slice(0, 5).map((task) => (
                  <li key={task.id}>
                    <DetailRowButton
                      onClick={onOpenTask ? () => onOpenTask(task) : undefined}
                      testId={`customer-detail-task-${task.id}`}
                    >
                      <p className="font-medium text-slate-800">{task.title}</p>
                      <p className="text-xs text-slate-500">{fmtDateTime(task.dueAt || task.createdAt)}</p>
                    </DetailRowButton>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Próximas citas">
            {upcoming.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-slate-400"><CalendarClock className="h-4 w-4" /> Sin citas próximas</p>
            ) : (
              <ul className="space-y-3" data-testid="customer-detail-appointments">
                {upcoming.map((a) => {
                  const st = statusMeta(a.status)
                  return (
                    <li key={a.id}>
                      <DetailRowButton
                        onClick={onOpenAppointment ? () => onOpenAppointment(a) : undefined}
                        testId={`customer-detail-appointment-${a.id}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-700">{fmtDate(a.date)} · {a.time} · {a.serviceName || 'Sin servicio'}</span>
                          <Badge tone={st.tone}>{st.name}</Badge>
                        </div>
                      </DetailRowButton>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section title="Historial de citas">
            {pastAppointments.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-slate-400"><CalendarDays className="h-4 w-4" /> Sin citas anteriores</p>
            ) : (
              <ul className="max-h-64 space-y-3 overflow-y-auto scrollbar-thin" data-testid="customer-detail-past-appointments">
                {pastAppointments.map((a) => {
                  const st = statusMeta(a.status)
                  return (
                    <li key={a.id}>
                      <DetailRowButton
                        onClick={onOpenAppointment ? () => onOpenAppointment(a) : undefined}
                        testId={`customer-detail-past-appointment-${a.id}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-700">{fmtDate(a.date)} · {a.time} · {a.serviceName || 'Sin servicio'}</span>
                          <Badge tone={st.tone}>{st.name}</Badge>
                        </div>
                      </DetailRowButton>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section title="Historial de compras">
            {purchases.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-slate-400"><ShoppingBag className="h-4 w-4" /> Aún sin compras registradas</p>
            ) : (
              <ul className="max-h-80 space-y-3 overflow-y-auto scrollbar-thin" data-testid="customer-detail-purchases">
                {purchases.map((s) => {
                  const receivable = receivables.find((row) => row.saleId === s.id)
                  const badge = saleStatusBadge(s, receivable)
                  return (
                  <li key={s.id}>
                    <DetailRowButton
                      onClick={onOpenSale ? () => onOpenSale(s) : undefined}
                      testId={`customer-detail-sale-${s.id}`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-slate-400">{fmtDateTime(s.createdAt)}</span>
                          <span className="font-heading font-bold text-slate-900">{formatDOP(s.total)}</span>
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-600">
                          {s.items?.map((i) => `${i.qty}× ${i.name}`).join(', ') || s.number || 'Venta'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                          <span className="text-[11px] font-medium text-slate-400">
                            {METHOD_LABELS[s.method] || s.method}
                            {s.origin === 'pipeline' ? ' · Pipeline' : ''}
                          </span>
                        </div>
                      </div>
                    </DetailRowButton>
                  </li>
                  )
                })}
              </ul>
            )}
          </Section>
    </div>
  )
}

export function CustomerDetailModal({
  open,
  onClose,
  customer,
  onEdit,
  onDelete,
  onSchedule,
  onQuote,
  onNewTask,
  onOpenSale,
  onOpenQuote,
  onOpenTask,
  onOpenAppointment,
  onOpenLead,
}) {
  return (
    <Modal open={open} onClose={onClose} title="Ficha de cliente" wide testId="customer-detail-modal">
      {customer && (
        <CustomerDetailPanel
          customer={customer}
          onEdit={onEdit}
          onDelete={onDelete}
          onSchedule={onSchedule}
          onQuote={onQuote}
          onNewTask={onNewTask}
          onOpenSale={onOpenSale}
          onOpenQuote={onOpenQuote}
          onOpenTask={onOpenTask}
          onOpenAppointment={onOpenAppointment}
          onOpenLead={onOpenLead}
        />
      )}
    </Modal>
  )
}
