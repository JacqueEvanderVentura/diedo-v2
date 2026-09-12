import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarPlus, FileText, GripVertical, Link2, Plus, UserCheck, UserPlus } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { CRM_BRANCH_FILTER_CLASS, matchesBranches } from '@/lib/branches'
import { customersVisibleToSession } from '@/lib/customerScope'
import { OPPORTUNITY_STAGES, STAGE_META } from '@/data/crm'
import { formatDOP } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { currentSessionActor } from '@/lib/sessionActor'
import { useSessionStore } from '@/stores/sessionStore'
import { usePointerKanban } from '@/modules/crm/hooks/usePointerKanban'
import { CloseOpportunityInvoiceModal } from '@/modules/crm/components/CloseOpportunityInvoiceModal'
import { PermissionElevationModal } from '@/components/auth/PermissionElevationModal'
import { downloadSaleInvoicePdf } from '@/modules/crm/lib/sales'
import { PIPELINE_INVOICE_PERMISSION } from '@/modules/crm/lib/pipelineInvoice'
import {
  effectiveOpportunityCustomerId,
  opportunityCompanyLabel,
  resolveCustomerForOpportunity,
} from '@/modules/crm/lib/opportunityCustomer'
import { useCatalogStore, isPosSellable } from '@/stores/catalogStore'
import { isProductAvailableAtBranch } from '@/lib/catalogSync'
import { PipelineStageHeaders, PIPELINE_COLUMN_WIDTH_CLASS } from '../components/PipelineStageHeaders'
import { ActivityFormModal } from '../components/ActivityFormModal'
import { CustomerFormModal } from '../components/CustomerFormModal'
import { QuoteFormModal } from '../components/QuoteFormModal'
import {
  customersForOpportunityBranch,
  isOpportunityCreateReady,
  opportunityCustomerDefaults,
} from '../lib/pipelineForm'
import { ensureCustomerForQuote } from '../lib/quoteCustomer'

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

function DealCard({
  opp,
  busy,
  dragging,
  onPointerDown,
  onFollowUp,
  onQuote,
  onConvert,
  onLinkCustomer,
}) {
  const meta = STAGE_META[opp.stage]
  const stopDrag = (event) => event.stopPropagation()

  return (
    <div
      onPointerDown={(event) => onPointerDown(event, { id: opp.id, stage: opp.stage, label: opp.title })}
      className={cn(
        'touch-none cursor-grab rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:cursor-grabbing',
        dragging && 'scale-[1.03] opacity-60',
        busy && 'pointer-events-none opacity-70'
      )}
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
          onPointerDown={stopDrag}
          disabled={busy}
          onClick={() => onFollowUp(opp)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Seguimiento
        </button>
        <button
          type="button"
          onPointerDown={stopDrag}
          disabled={busy}
          onClick={() => onQuote(opp)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 disabled:opacity-50"
        >
          <FileText className="h-3.5 w-3.5" /> Cotizar
        </button>
        {!opp.customerId && opp.leadId && (
          <button
            type="button"
            onPointerDown={stopDrag}
            disabled={busy}
            onClick={() => onConvert(opp)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
          >
            <UserCheck className="h-3.5 w-3.5" /> Convertir
          </button>
        )}
        {!opp.customerId && (
          <button
            type="button"
            onPointerDown={stopDrag}
            disabled={busy}
            onClick={() => onLinkCustomer(opp)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <Link2 className="h-3.5 w-3.5" /> Cliente
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
  const sessionUser = useSessionStore((state) => state.user)
  const updateOpportunityStage = useCrmStore((state) => state.updateOpportunityStage)
  const updateOpportunity = useCrmStore((state) => state.updateOpportunity)
  const closeOpportunityWithInvoice = useCrmStore((state) => state.closeOpportunityWithInvoice)
  const addQuote = useCrmStore((state) => state.addQuote)
  const updateQuote = useCrmStore((state) => state.updateQuote)
  const addOpportunity = useCrmStore((state) => state.addOpportunity)
  const products = useCatalogStore((state) => state.products)
  const convertToCustomer = useCrmStore((state) => state.convertToCustomer)
  const leads = useCrmStore((state) => state.leads)
  const quotes = useCrmStore((state) => state.quotes)
  const settings = useConfigStore((state) => state.settings)
  const paymentMethods = useConfigStore((state) => state.paymentMethods)
  const canInvoice = useSessionStore((state) => state.hasPermission(PIPELINE_INVOICE_PERMISSION))
  const sessionBranchId = useSessionStore((state) => state.user?.branchIds?.[0])
  const sessionMembershipId = useSessionStore((state) => state.user?.membershipId)

  const [modalOpen, setModalOpen] = useState(false)
  const [linkingOpportunity, setLinkingOpportunity] = useState(null)
  const [linkCustomerId, setLinkCustomerId] = useState('')
  const [branchIds, setBranchIds] = useState([])
  const [form, setForm] = useState(emptyOpportunity())
  const [busyOpportunityId, setBusyOpportunityId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pendingClose, setPendingClose] = useState(null)
  const [closePaymentMethod, setClosePaymentMethod] = useState('efectivo')
  const [elevationOpen, setElevationOpen] = useState(false)
  const [closeQuoteBusy, setCloseQuoteBusy] = useState(false)
  const [closeConvertBusy, setCloseConvertBusy] = useState(false)
  const [closeQuoteFormOpen, setCloseQuoteFormOpen] = useState(false)
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false)
  const [followUpOpportunityId, setFollowUpOpportunityId] = useState('')
  const [customerFormOpen, setCustomerFormOpen] = useState(false)
  const [customerFormDefaults, setCustomerFormDefaults] = useState(null)
  const [customerFormTarget, setCustomerFormTarget] = useState(null)

  const pendingOpportunity = useMemo(() => {
    if (!pendingClose) return null
    return opportunities.find((item) => item.id === pendingClose.id) || pendingClose
  }, [opportunities, pendingClose])

  const closeCatalogProducts = useMemo(() => {
    if (!pendingOpportunity?.branchId) {
      return products.filter((product) => isPosSellable(product))
    }
    return products.filter((product) => (
      isPosSellable(product)
      && isProductAvailableAtBranch(product, pendingOpportunity.branchId)
    ))
  }, [products, pendingOpportunity?.branchId])

  useEffect(() => {
    if (!elevationOpen && pendingClose && !canInvoice) {
      setPendingClose(null)
    }
  }, [elevationOpen, pendingClose, canInvoice])

  const visibleCustomers = useMemo(
    () => customersVisibleToSession(customers, sessionUser),
    [customers, sessionUser]
  )

  const activeCustomers = useMemo(
    () => visibleCustomers.filter((customer) => !customer.isDefault && customer.active !== false),
    [visibleCustomers]
  )

  const closeLinkableCustomers = useMemo(
    () => customersForOpportunityBranch(activeCustomers, pendingOpportunity?.branchId),
    [activeCustomers, pendingOpportunity?.branchId],
  )

  const closeDocumentCtx = useMemo(
    () => ({
      branches,
      settings,
      paymentMethods,
      customers: activeCustomers,
    }),
    [branches, settings, paymentMethods, activeCustomers],
  )

  useEffect(() => {
    if (!pendingOpportunity || pendingOpportunity.customerId) return
    const match = resolveCustomerForOpportunity(pendingOpportunity, activeCustomers)
    if (!match) return
    updateOpportunity(pendingOpportunity.id, {
      customerId: match.id,
      customerName: match.name,
    }).catch(() => {})
  }, [pendingOpportunity, activeCustomers, updateOpportunity])

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opportunity) => matchesBranches(
      opportunity,
      branchIds,
      (row) => (row.branchId ? [row.branchId] : []),
    ))
  }, [opportunities, branchIds])

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

  const handleStageMove = async (opportunityId, stage) => {
    if (stage === 'cerrado') {
      const opportunity = opportunities.find((item) => item.id === opportunityId)
      if (!opportunity) return
      if (!canInvoice) {
        setPendingClose(opportunity)
        setElevationOpen(true)
        return
      }
      setPendingClose(opportunity)
      setClosePaymentMethod('efectivo')
      return
    }

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

  const ensureCloseCustomerLinked = async (opportunity) => {
    const customerId = effectiveOpportunityCustomerId(opportunity, activeCustomers)
    if (!customerId || opportunity.customerId) return customerId
    const match = resolveCustomerForOpportunity(opportunity, activeCustomers)
    await updateOpportunity(opportunity.id, {
      customerId,
      customerName: match?.name || opportunityCompanyLabel(opportunity),
    })
    return customerId
  }

  const resolveCloseQuoteCustomerId = async (opportunity) => {
    const linked = await ensureCloseCustomerLinked(opportunity)
    if (linked) return linked
    const ensured = await ensureCustomerForQuote({
      customerId: null,
      opportunity,
      addCustomer: useCustomersStore.getState().addCustomer,
      updateOpportunity,
    })
    return ensured?.id || null
  }

  const handleCloseCreateQuote = async (payload) => {
    if (!pendingOpportunity) return
    setCloseQuoteBusy(true)
    try {
      const customerId = payload.customerId || await resolveCloseQuoteCustomerId(pendingOpportunity)
      if (!customerId) {
        toast.error('La oportunidad necesita nombre y sucursal para crear el cliente al cotizar.')
        return
      }
      await addQuote({ ...payload, customerId })
      toast.success(payload.status === 'aceptada' ? 'Cotización aceptada' : 'Cotización creada')
    } catch (error) {
      toast.error(error.message || 'No se pudo crear la cotización')
      throw error
    } finally {
      setCloseQuoteBusy(false)
    }
  }

  const handleCloseLinkQuote = async (quoteId, opportunityId) => {
    setCloseQuoteBusy(true)
    try {
      await updateQuote(quoteId, { opportunityId })
      toast.success('Cotización vinculada a la oportunidad')
    } catch (error) {
      toast.error(error.message || 'No se pudo vincular la cotización')
      throw error
    } finally {
      setCloseQuoteBusy(false)
    }
  }

  const confirmCloseWithInvoice = async ({ customerId } = {}) => {
    if (!pendingOpportunity) return
    setBusyOpportunityId(pendingOpportunity.id)
    try {
      const resolvedCustomerId = customerId
        || await resolveCloseQuoteCustomerId(pendingOpportunity)
      const sale = await closeOpportunityWithInvoice(pendingOpportunity.id, {
        paymentMethod: closePaymentMethod,
        customerId: resolvedCustomerId,
      })
      if (sale) {
        downloadSaleInvoicePdf(sale, { branches, settings, paymentMethods })
      }
      setPendingClose(null)
      toast.success('Oportunidad cerrada y factura descargada')
    } catch (error) {
      toast.error(error.message || 'No se pudo facturar la oportunidad')
    } finally {
      setBusyOpportunityId(null)
    }
  }

  const {
    dragState,
    hoverStage,
    startDrag,
    moveDrag,
    endDrag,
    cancelDrag,
  } = usePointerKanban({
    onMove: handleStageMove,
    isDisabled: Boolean(busyOpportunityId),
  })

  const selectedCustomer = activeCustomers.find((customer) => customer.id === form.customerId)
  const formBranches = branches.filter((branch) => (
    branch.active && (!selectedCustomer || belongsToBranch(selectedCustomer, branch.id))
  ))
  const linkableCustomers = linkingOpportunity
    ? activeCustomers.filter((customer) => belongsToBranch(customer, linkingOpportunity.branchId))
    : []

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
    if (!isOpportunityCreateReady(form)) {
      return toast.error('Completa título, nombre del cliente y sucursal')
    }
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

  const openFollowUp = (opportunity) => {
    setFollowUpOpportunityId(opportunity.id)
    setFollowUpModalOpen(true)
  }

  const openCreateCustomerForLink = () => {
    if (!linkingOpportunity) return
    setCustomerFormDefaults(opportunityCustomerDefaults(linkingOpportunity))
    setCustomerFormTarget('link')
    setCustomerFormOpen(true)
  }

  const openCreateCustomerForNewOpp = () => {
    setCustomerFormDefaults({
      name: form.customerName || '',
      company: form.customerName || '',
      customerType: 'b2b',
      branchIds: form.branchId ? [form.branchId] : [],
    })
    setCustomerFormTarget('create-opp')
    setCustomerFormOpen(true)
  }

  const attachCustomerToOpportunity = async (opportunity, customer, { closeLinkModal = true } = {}) => {
    if (!opportunity?.id || !customer?.id) return
    setBusyOpportunityId(opportunity.id)
    try {
      await updateOpportunity(opportunity.id, {
        customerId: customer.id,
        customerName: customer.name,
      })
      toast.success('Cliente vinculado a la oportunidad')
      if (closeLinkModal) {
        setLinkingOpportunity(null)
        setLinkCustomerId('')
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo vincular el cliente')
    } finally {
      setBusyOpportunityId(null)
    }
  }

  const openCreateCustomerForClose = () => {
    if (!pendingOpportunity) return
    setCustomerFormDefaults(opportunityCustomerDefaults(pendingOpportunity))
    setCustomerFormTarget('close-invoice')
    setCustomerFormOpen(true)
  }

  const linkCustomerOnClose = async (customerId) => {
    const customer = activeCustomers.find((item) => item.id === customerId)
    if (!customer || !pendingOpportunity) {
      toast.error('Selecciona un cliente válido')
      return
    }
    await attachCustomerToOpportunity(pendingOpportunity, customer, { closeLinkModal: false })
  }

  const convertLeadForClose = async () => {
    if (!pendingOpportunity?.leadId) return
    setCloseConvertBusy(true)
    try {
      const customer = await convertToCustomer(pendingOpportunity.leadId)
      if (customer?.id) {
        await attachCustomerToOpportunity(pendingOpportunity, customer, { closeLinkModal: false })
      }
      toast.success('Lead convertido a cliente B2B')
    } catch (error) {
      toast.error(error.message || 'No se pudo convertir el lead')
    } finally {
      setCloseConvertBusy(false)
    }
  }

  const handleCustomerCreated = async (customer) => {
    if (customerFormTarget === 'close-invoice' && pendingOpportunity) {
      await attachCustomerToOpportunity(pendingOpportunity, customer, { closeLinkModal: false })
      return
    }
    if (customerFormTarget === 'link' && linkingOpportunity) {
      await attachCustomerToOpportunity(linkingOpportunity, customer)
      return
    }
    if (customerFormTarget === 'create-opp') {
      selectCustomer(customer.id)
      setForm((current) => ({
        ...current,
        customerName: customer.name,
        branchId: customer.branchIds?.[0] || customer.branchId || current.branchId,
      }))
      toast.success('Cliente listo para la oportunidad')
    }
  }

  const linkCustomer = async () => {
    const customer = linkableCustomers.find((item) => item.id === linkCustomerId)
    if (!customer || !linkingOpportunity) return toast.error('Selecciona un cliente de la misma sucursal')
    await attachCustomerToOpportunity(linkingOpportunity, customer)
  }

  const toolbarRef = useRef(null)
  const boardHorizontalScrollRef = useRef(null)
  const [boardViewportHeight, setBoardViewportHeight] = useState(0)

  useLayoutEffect(() => {
    const node = boardHorizontalScrollRef.current
    if (!node) return undefined
    const update = () => setBoardViewportHeight(node.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

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
    <div
      className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col gap-4 overflow-hidden p-6 sm:p-8"
      data-testid="crm-pipeline"
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={cancelDrag}
    >
      <div
        ref={toolbarRef}
        className="z-30 shrink-0 -mx-6 border-b border-slate-100 bg-white px-6 pb-4 sm:-mx-8 sm:px-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl font-bold text-slate-900">Pipeline</h2>
            <p className="text-sm text-slate-500">{totals.count} oportunidades abiertas · {formatDOP(totals.value)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BranchMultiSelect
              branches={branches}
              branchIds={branchIds}
              onChange={setBranchIds}
              className={CRM_BRANCH_FILTER_CLASS}
              testId="pipeline-branch-filter"
            />
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nueva oportunidad
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 pt-1">
        <div
          ref={boardHorizontalScrollRef}
          className="scrollbar-pipeline-h min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1"
          data-testid="pipeline-board-horizontal-scroll"
        >
          <div
            className="flex w-max min-w-full flex-col"
            style={boardViewportHeight > 0 ? { height: boardViewportHeight } : undefined}
          >
            <PipelineStageHeaders
              stages={OPPORTUNITY_STAGES}
              stageMeta={STAGE_META}
              byStage={byStage}
            />

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scrollbar-thin"
              data-testid="pipeline-board-vertical-scroll"
            >
              <div className="flex min-h-full items-stretch gap-4 pb-2" data-testid="pipeline-board-body">
                {OPPORTUNITY_STAGES.map((stage) => {
                  const deals = byStage[stage] || []
                  return (
                    <div
                      key={stage}
                      data-pipeline-stage={stage}
                      className={cn(
                        PIPELINE_COLUMN_WIDTH_CLASS,
                        'flex min-h-full flex-col rounded-xl transition-colors',
                        hoverStage === stage && 'bg-blue-50/70 ring-2 ring-blue-200',
                      )}
                    >
                      <div className="min-h-full flex-1 space-y-2 rounded-xl bg-slate-50/80 p-2">
                        {deals.map((opportunity) => (
                          <DealCard
                            key={opportunity.id}
                            opp={opportunity}
                            busy={busyOpportunityId === opportunity.id}
                            dragging={dragState?.id === opportunity.id}
                            onPointerDown={startDrag}
                            onFollowUp={openFollowUp}
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
            </div>
          </div>
        </div>
      </div>

      {dragState && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl border border-blue-200 bg-white p-3 shadow-2xl scale-[1.03]"
          style={{
            width: dragState.width,
            left: dragState.x - dragState.width / 2,
            top: dragState.y - 24,
          }}
          data-testid="pipeline-drag-ghost"
        >
          <p className="text-sm font-semibold text-slate-900">{dragState.label}</p>
        </div>
      )}

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
            <Input
              value={form.customerName}
              disabled={Boolean(form.leadId || form.customerId)}
              onChange={(event) => setForm((current) => ({
                ...current,
                customerName: event.target.value,
                title: current.title || (event.target.value ? `${event.target.value} — Oportunidad` : ''),
              }))}
            />
          </div>
          {!form.customerId && (
            <Button type="button" size="sm" variant="secondary" onClick={openCreateCustomerForNewOpp}>
              <UserPlus className="h-3.5 w-3.5" /> Crear cliente
            </Button>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sucursal</label>
            <BranchMultiSelect
              branches={formBranches}
              branchIds={form.branchId ? [form.branchId] : []}
              onChange={(ids) => setForm((current) => ({ ...current, branchId: ids[0] || '' }))}
              selectionMode="single"
              showAllOption={false}
              disabled={Boolean(form.leadId)}
              className="w-full"
              testId="opportunity-branch"
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

      <CloseOpportunityInvoiceModal
        open={Boolean(pendingOpportunity) && canInvoice}
        onClose={() => {
          setPendingClose(null)
          setCloseQuoteFormOpen(false)
        }}
        opportunity={pendingOpportunity}
        quotes={quotes}
        branches={branches}
        customers={activeCustomers}
        linkableCustomers={closeLinkableCustomers}
        products={closeCatalogProducts}
        paymentMethod={closePaymentMethod}
        onPaymentMethodChange={setClosePaymentMethod}
        onCreateQuote={handleCloseCreateQuote}
        onLinkQuote={handleCloseLinkQuote}
        onConfirm={confirmCloseWithInvoice}
        onCreateCustomer={openCreateCustomerForClose}
        onLinkCustomer={linkCustomerOnClose}
        onConvertLead={pendingOpportunity?.leadId ? convertLeadForClose : undefined}
        onOpenQuoteBuilder={() => setCloseQuoteFormOpen(true)}
        documentCtx={closeDocumentCtx}
        loading={busyOpportunityId === pendingOpportunity?.id}
        quoteBusy={closeQuoteBusy}
        convertLeadBusy={closeConvertBusy}
      />

      <QuoteFormModal
        open={closeQuoteFormOpen}
        onClose={() => setCloseQuoteFormOpen(false)}
        initialContext={pendingOpportunity ? { opportunityId: pendingOpportunity.id } : null}
        onSaved={() => {
          setCloseQuoteFormOpen(false)
          toast.success('Cotización guardada; ya puedes generar la factura')
        }}
      />

      <PermissionElevationModal
        open={elevationOpen}
        onClose={() => setElevationOpen(false)}
        permissionCode={PIPELINE_INVOICE_PERMISSION}
        title="Autorizar facturación"
        description="Para cerrar una oportunidad y generar la factura, un supervisor debe autorizar el permiso de venta por 3 minutos."
        onElevated={() => setClosePaymentMethod('efectivo')}
      />

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
            <p className="text-sm text-amber-600">No hay clientes en esta sucursal. Puedes crear uno aquí.</p>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={openCreateCustomerForLink} data-testid="pipeline-link-create-customer">
            <UserPlus className="h-3.5 w-3.5" /> Crear cliente
          </Button>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLinkingOpportunity(null)}>Cancelar</Button>
            <Button onClick={linkCustomer} disabled={!linkCustomerId || Boolean(busyOpportunityId)}>
              Vincular
            </Button>
          </div>
        </div>
      </Modal>

      <CustomerFormModal
        open={customerFormOpen}
        onClose={() => {
          setCustomerFormOpen(false)
          setCustomerFormDefaults(null)
          setCustomerFormTarget(null)
        }}
        defaults={customerFormDefaults}
        onCreated={handleCustomerCreated}
      />

      <ActivityFormModal
        open={followUpModalOpen}
        onClose={() => {
          setFollowUpModalOpen(false)
          setFollowUpOpportunityId('')
        }}
        defaultOpportunityId={followUpOpportunityId}
      />
    </div>
  )
}
