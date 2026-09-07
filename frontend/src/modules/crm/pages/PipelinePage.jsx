import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarPlus, FileText, GripVertical, Link2, Plus, UserCheck } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { buildBranchFilterOptions } from '@/lib/branches'
import { OPPORTUNITY_STAGES, STAGE_META } from '@/data/crm'
import { formatDOP } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { currentSessionActor } from '@/lib/sessionActor'
import { useSessionStore } from '@/stores/sessionStore'

const emptyOpportunity = () => ({
  title: '',
  customerName: '',
  customerId: '',
  value: '',
  leadId: '',
  branchId: '',
  stage: 'nuevo',
  notes: '',
})

function belongsToBranch(customer, branchId) {
  if (!branchId) return true
  const branchIds = customer.branchIds?.length ? customer.branchIds : [customer.branchId].filter(Boolean)
  return branchIds.includes(branchId)
}

function DealCard({ opp, busy, onDragStart, onFollowUp, onQuote, onConvert, onLinkCustomer }) {
  const meta = STAGE_META[opp.stage]
  const stopDrag = (event) => event.stopPropagation()

  return (
    <div
      draggable={!busy}
      onDragStart={(event) => onDragStart(event, opp.id)}
      className="cursor-grab rounded-xl border border-slate-100 bg-white p-3 shadow-sm active:cursor-grabbing"
      data-testid={`pipeline-opportunity-${opp.id}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{opp.title}</p>
          <p className="text-xs text-slate-500">{opp.customerName}</p>
          <p className="mt-2 font-heading text-sm font-bold text-emerald-600">{formatDOP(opp.value)}</p>
        </div>
      </div>
      <div className="mt-2">
        <span className={cn('inline-block h-1 w-full rounded-full', meta.color)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
        <button
          type="button"
          draggable={false}
          disabled={busy}
          onMouseDown={stopDrag}
          onClick={() => onFollowUp(opp)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Seguimiento
        </button>
        {opp.customerId ? (
          <button
            type="button"
            draggable={false}
            disabled={busy}
            onMouseDown={stopDrag}
            onClick={() => onQuote(opp)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" /> Cotizar
          </button>
        ) : opp.leadId ? (
          <button
            type="button"
            draggable={false}
            disabled={busy}
            onMouseDown={stopDrag}
            onClick={() => onConvert(opp)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
          >
            <UserCheck className="h-3.5 w-3.5" /> Convertir
          </button>
        ) : (
          <button
            type="button"
            draggable={false}
            disabled={busy}
            onMouseDown={stopDrag}
            onClick={() => onLinkCustomer(opp)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <Link2 className="h-3.5 w-3.5" /> Vincular cliente
          </button>
        )}
      </div>
    </div>
  )
}

export default function PipelinePage() {
  const navigate = useNavigate()
  const opportunities = useCrmStore((state) => state.opportunities)
  const branches = useConfigStore((state) => state.branches)
  const customers = useCustomersStore((state) => state.customers)
  const updateOpportunityStage = useCrmStore((state) => state.updateOpportunityStage)
  const updateOpportunity = useCrmStore((state) => state.updateOpportunity)
  const addOpportunity = useCrmStore((state) => state.addOpportunity)
  const convertToCustomer = useCrmStore((state) => state.convertToCustomer)
  const leads = useCrmStore((state) => state.leads)
  const sessionBranchId = useSessionStore((state) => state.user?.branchIds?.[0])
  const sessionMembershipId = useSessionStore((state) => state.user?.membershipId)

  const [modalOpen, setModalOpen] = useState(false)
  const [linkingOpportunity, setLinkingOpportunity] = useState(null)
  const [linkCustomerId, setLinkCustomerId] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [form, setForm] = useState(emptyOpportunity())
  const [dragId, setDragId] = useState(null)
  const [busyOpportunityId, setBusyOpportunityId] = useState(null)
  const [saving, setSaving] = useState(false)

  const activeCustomers = useMemo(
    () => customers.filter((customer) => !customer.isDefault && customer.active !== false),
    [customers]
  )

  const filteredOpportunities = useMemo(() => {
    if (branchFilter === 'all') return opportunities
    return opportunities.filter((opportunity) => opportunity.branchId === branchFilter)
  }, [opportunities, branchFilter])

  const byStage = useMemo(() => {
    const map = Object.fromEntries(OPPORTUNITY_STAGES.map((stage) => [stage, []]))
    filteredOpportunities.forEach((opportunity) => {
      if (map[opportunity.stage]) map[opportunity.stage].push(opportunity)
    })
    return map
  }, [filteredOpportunities])

  const totals = useMemo(() => {
    const open = opportunities.filter((opportunity) => !['cerrado', 'perdido'].includes(opportunity.stage))
    return { count: open.length, value: open.reduce((total, opportunity) => total + (opportunity.value || 0), 0) }
  }, [opportunities])

  const selectedCustomer = activeCustomers.find((customer) => customer.id === form.customerId)
  const formBranches = branches.filter((branch) => (
    branch.active && (!selectedCustomer || belongsToBranch(selectedCustomer, branch.id))
  ))
  const linkableCustomers = linkingOpportunity
    ? activeCustomers.filter((customer) => belongsToBranch(customer, linkingOpportunity.branchId))
    : []

  const onDragStart = (event, id) => {
    setDragId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  const onDrop = async (event, stage) => {
    event.preventDefault()
    const opportunityId = event.dataTransfer.getData('text/plain') || dragId
    if (!opportunityId) return
    setDragId(null)
    setBusyOpportunityId(opportunityId)
    try {
      await updateOpportunityStage(opportunityId, stage)
      toast.success(`Movido a ${STAGE_META[stage].label}`)
    } catch (error) {
      toast.error(error.message || 'No se pudo mover la oportunidad')
    } finally {
      setBusyOpportunityId(null)
    }
  }

  const selectLead = (leadId) => {
    const lead = leads.find((item) => item.id === leadId)
    setForm((current) => ({
      ...current,
      leadId,
      customerId: '',
      customerName: lead ? lead.company || lead.name : '',
      branchId: lead?.branchId || current.branchId,
      title: current.title || (lead ? `${lead.company || lead.name} — Oportunidad` : ''),
    }))
  }

  const selectCustomer = (customerId) => {
    const customer = activeCustomers.find((item) => item.id === customerId)
    setForm((current) => ({
      ...current,
      customerId,
      leadId: '',
      customerName: customer?.name || '',
      branchId: customer?.branchIds?.[0] || customer?.branchId || current.branchId,
      title: current.title || (customer ? `${customer.name} — Oportunidad` : ''),
    }))
  }

  const openCreate = () => {
    setForm({
      ...emptyOpportunity(),
      branchId: sessionBranchId || branches.find((branch) => branch.active)?.id || '',
    })
    setModalOpen(true)
  }

  const submit = async () => {
    if (!form.leadId && !form.customerId) {
      return toast.error('Vincula la oportunidad a un lead o a un cliente')
    }
    if (!form.title.trim() || !form.customerName.trim()) return toast.error('Título y cliente requeridos')
    if (!form.branchId) return toast.error('Selecciona una sucursal')
    setSaving(true)
    try {
      await addOpportunity({
        title: form.title.trim(),
        customerName: form.customerName.trim(),
        customerId: form.customerId || null,
        value: Number(form.value) || 0,
        leadId: form.leadId || null,
        stage: form.stage,
        branchId: form.branchId,
        assignedUserId: sessionMembershipId || currentSessionActor().id,
        notes: form.notes.trim(),
      })
      setModalOpen(false)
      setForm(emptyOpportunity())
      toast.success('Oportunidad creada y vinculada')
    } catch (error) {
      toast.error(error.message || 'No se pudo crear la oportunidad')
    } finally {
      setSaving(false)
    }
  }

  const convertOpportunity = async (opportunity) => {
    if (!opportunity.leadId) return
    setBusyOpportunityId(opportunity.id)
    try {
      await convertToCustomer(opportunity.leadId)
      toast.success('Lead convertido; la oportunidad ya está vinculada al cliente')
    } catch (error) {
      toast.error(error.message || 'No se pudo convertir el lead')
    } finally {
      setBusyOpportunityId(null)
    }
  }

  const openLinkCustomer = (opportunity) => {
    setLinkingOpportunity(opportunity)
    setLinkCustomerId('')
  }

  const linkCustomer = async () => {
    const customer = linkableCustomers.find((item) => item.id === linkCustomerId)
    if (!customer || !linkingOpportunity) return toast.error('Selecciona un cliente de la misma sucursal')
    setBusyOpportunityId(linkingOpportunity.id)
    try {
      await updateOpportunity(linkingOpportunity.id, { customerId: customer.id })
      setLinkingOpportunity(null)
      setLinkCustomerId('')
      toast.success('Cliente vinculado a la oportunidad')
    } catch (error) {
      toast.error(error.message || 'No se pudo vincular el cliente')
    } finally {
      setBusyOpportunityId(null)
    }
  }

  const leadOptions = [
    { value: '', label: 'Sin lead' },
    ...leads
      .filter((lead) => !lead.opportunityId && lead.status !== 'convertido')
      .map((lead) => ({ value: lead.id, label: lead.company || lead.name })),
  ]
  const customerOptions = [
    { value: '', label: 'Sin cliente' },
    ...activeCustomers.map((customer) => ({ value: customer.id, label: customer.name })),
  ]

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-6 sm:p-8" data-testid="crm-pipeline">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Pipeline</h2>
          <p className="text-sm text-slate-500">{totals.count} oportunidades abiertas · {formatDOP(totals.value)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={branchFilter} onChange={setBranchFilter} options={buildBranchFilterOptions(branches)} className="min-w-[180px]" data-testid="pipeline-branch-filter" />
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nueva oportunidad
          </Button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {OPPORTUNITY_STAGES.map((stage) => {
          const meta = STAGE_META[stage]
          const deals = byStage[stage] || []
          const stageValue = deals.reduce((total, opportunity) => total + (opportunity.value || 0), 0)
          return (
            <div
              key={stage}
              className="w-72 shrink-0"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDrop(event, stage)}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', meta.color)} />
                  <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{deals.length}</span>
                </div>
              </div>
              <p className="mb-3 text-xs text-slate-400">{formatDOP(stageValue)}</p>
              <div className="min-h-[120px] space-y-2 rounded-xl bg-slate-50/80 p-2">
                {deals.map((opportunity) => (
                  <DealCard
                    key={opportunity.id}
                    opp={opportunity}
                    busy={busyOpportunityId === opportunity.id}
                    onDragStart={onDragStart}
                    onFollowUp={(item) => navigate(`/crm/seguimiento?opportunityId=${item.id}`)}
                    onQuote={(item) => navigate(`/crm/cotizaciones?opportunityId=${item.id}`)}
                    onConvert={convertOpportunity}
                    onLinkCustomer={openLinkCustomer}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva oportunidad">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Lead origen</label>
            <Select value={form.leadId} onChange={selectLead} options={leadOptions} data-testid="opportunity-lead" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Cliente existente</label>
            <Select value={form.customerId} onChange={selectCustomer} options={customerOptions} data-testid="opportunity-customer" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Título</label>
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Empresa o cliente</label>
            <Input value={form.customerName} disabled />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sucursal</label>
            <Select
              value={form.branchId}
              onChange={(branchId) => setForm((current) => ({ ...current, branchId }))}
              options={formBranches.map((branch) => ({ value: branch.id, label: branch.name }))}
              disabled={Boolean(form.leadId)}
              data-testid="opportunity-branch"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Valor (DOP)</label>
            <Input type="number" min="0" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Etapa inicial</label>
            <Select value={form.stage} onChange={(stage) => setForm((current) => ({ ...current, stage }))} options={OPPORTUNITY_STAGES.map((stage) => ({ value: stage, label: STAGE_META[stage].label }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Notas</label>
            <Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Creando...' : 'Crear'}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(linkingOpportunity)}
        onClose={() => setLinkingOpportunity(null)}
        title="Vincular cliente"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Selecciona un cliente de la sucursal de {linkingOpportunity?.customerName}. Después podrás generar su cotización.
          </p>
          <Select
            value={linkCustomerId}
            onChange={setLinkCustomerId}
            options={[
              { value: '', label: 'Seleccionar cliente' },
              ...linkableCustomers.map((customer) => ({ value: customer.id, label: customer.name })),
            ]}
            data-testid="opportunity-link-customer"
          />
          {linkableCustomers.length === 0 && (
            <p className="text-sm text-amber-600">No hay clientes disponibles en esta sucursal.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLinkingOpportunity(null)}>Cancelar</Button>
            <Button onClick={linkCustomer} disabled={!linkCustomerId || Boolean(busyOpportunityId)}>
              Vincular
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
