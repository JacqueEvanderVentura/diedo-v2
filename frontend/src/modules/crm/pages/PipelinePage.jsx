import { useCrmCapabilities } from '@/modules/crm/hooks/useCrmCapabilities'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarPlus, FileText, GripVertical, Link2, Plus, Search, UserCheck, UserPlus } from 'lucide-react'
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
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import { usePointerKanban } from '@/modules/crm/hooks/usePointerKanban'
import { CloseLeadInvoiceModal } from '@/modules/crm/components/CloseOpportunityInvoiceModal'
import { PermissionElevationModal } from '@/components/auth/PermissionElevationModal'
import { downloadSaleInvoicePdf } from '@/modules/crm/lib/sales'
import { PIPELINE_INVOICE_PERMISSION } from '@/modules/crm/lib/pipelineInvoice'
import {
  effectiveLeadCustomerId,
  leadCompanyLabel,
  resolveCustomerForLead,
} from '@/modules/crm/lib/leadCustomer'
import { leadDisplayTitle, leadPipelineStage } from '@/modules/crm/lib/pipelineLeads'
import { useCatalogStore, isPosSellable } from '@/stores/catalogStore'
import { isProductAvailableAtBranch } from '@/lib/catalogSync'
import { PipelineStageHeaders, PIPELINE_COLUMN_WIDTH_CLASS } from '../components/PipelineStageHeaders'
import { ActivityFormModal } from '../components/ActivityFormModal'
import { CustomerFormModal } from '../components/CustomerFormModal'
import { QuoteFormModal } from '../components/QuoteFormModal'
import {
  customersForOpportunityBranch,
  leadCustomerDefaults,
} from '../lib/pipelineForm'
import { ensureCustomerForQuote } from '../lib/quoteCustomer'
import { leadMatchesQuery } from '../lib/pipelineSearch'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { IncrementalListFooter } from '@/components/ui/IncrementalListFooter'

function belongsToBranch(customer, branchId) {
  if (!branchId) return true
  const branchIds = customer.branchIds?.length ? customer.branchIds : [customer.branchId].filter(Boolean)
  return branchIds.includes(branchId)
}

function DealCard({
  lead,
  busy,
  dragging,
  onPointerDown,
  onFollowUp,
  onQuote,
  onConvert,
  onLinkCustomer,
}) {
  const can = useCrmCapabilities()
  const stage = leadPipelineStage(lead)
  const meta = STAGE_META[stage]
  const stopDrag = (event) => event.stopPropagation()

  return (
    <div
      onPointerDown={(event) => can.manage && onPointerDown(event, { id: lead.id, stage, label: leadDisplayTitle(lead) })}
      className={cn(
        'touch-none cursor-grab rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:cursor-grabbing',
        dragging && 'scale-[1.03] opacity-60',
        busy && 'pointer-events-none opacity-70'
      )}
      data-testid={`pipeline-lead-${lead.id}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{leadDisplayTitle(lead)}</p>
          <p className="text-xs text-slate-500">{lead.phone || lead.email || '—'}</p>
          <p className="mt-2 font-heading text-sm font-bold text-emerald-600">{formatDOP(lead.pipelineValue || 0)}</p>
        </div>
      </div>
      <div className="mt-2">
        <span className={cn('inline-block h-1 w-full rounded-full', meta.color)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
        <button
          type="button"
          onPointerDown={stopDrag}
          disabled={busy || !can.manage}
          onClick={() => onFollowUp(lead)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Seguimiento
        </button>
        <button
          type="button"
          onPointerDown={stopDrag}
          disabled={busy || !can.quote}
          onClick={() => onQuote(lead)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 disabled:opacity-50"
        >
          <FileText className="h-3.5 w-3.5" /> Cotizar
        </button>
        {!lead.customerId && (
          <button
            type="button"
            onPointerDown={stopDrag}
            disabled={busy || !can.convert}
            onClick={() => onConvert(lead)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
          >
            <UserCheck className="h-3.5 w-3.5" /> Convertir
          </button>
        )}
        {!lead.customerId && (
          <button
            type="button"
            onPointerDown={stopDrag}
            disabled={busy || !can.manage}
            onClick={() => onLinkCustomer(lead)}
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
  const can = useCrmCapabilities()
  const navigate = useNavigate()
  const pipelineLeads = useCrmStore((state) => state.leads)
  const branches = useConfigStore((state) => state.branches)
  const customers = useCustomersStore((state) => state.customers)
  const sessionUser = useSessionStore((state) => state.user)
  const updateLeadStage = useCrmStore((state) => state.updateLeadStage)
  const updateLead = useCrmStore((state) => state.updateLead)
  const closeLeadWithInvoice = useCrmStore((state) => state.closeLeadWithInvoice)
  const addQuote = useCrmStore((state) => state.addQuote)
  const updateQuote = useCrmStore((state) => state.updateQuote)
  const products = useCatalogStore((state) => state.products)
  const convertToCustomer = useCrmStore((state) => state.convertToCustomer)
  const quotes = useCrmStore((state) => state.quotes)
  const settings = useConfigStore((state) => state.settings)
  const paymentMethods = useConfigStore((state) => state.paymentMethods)
  const canInvoice = useSessionStore((state) => state.hasPermission(PIPELINE_INVOICE_PERMISSION))
  const sessionBranchId = useSessionStore((state) => state.user?.branchIds?.[0])
  const [newQuoteOpen, setNewQuoteOpen] = useState(false)
  const [newQuoteContext, setNewQuoteContext] = useState(null)
  const [linkingLead, setLinkingLead] = useState(null)
  const [linkCustomerId, setLinkCustomerId] = useState('')
  const [branchIds, setBranchIds] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [busyLeadId, setBusyLeadId] = useState(null)
  const [pendingClose, setPendingClose] = useState(null)
  const [closePaymentMethod, setClosePaymentMethod] = useState('efectivo')
  const [elevationOpen, setElevationOpen] = useState(false)
  const [closeQuoteBusy, setCloseQuoteBusy] = useState(false)
  const [closeConvertBusy, setCloseConvertBusy] = useState(false)
  const [closeQuoteFormOpen, setCloseQuoteFormOpen] = useState(false)
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false)
  const [followUpLeadId, setFollowUpLeadId] = useState('')
  const [customerFormOpen, setCustomerFormOpen] = useState(false)
  const [customerFormDefaults, setCustomerFormDefaults] = useState(null)
  const [customerFormTarget, setCustomerFormTarget] = useState(null)

  const pendingLead = useMemo(() => {
    if (!pendingClose) return null
    return pipelineLeads.find((item) => item.id === pendingClose.id) || pendingClose
  }, [pipelineLeads, pendingClose])

  const closeCatalogProducts = useMemo(() => {
    if (!pendingLead?.branchId) {
      return products.filter((product) => isPosSellable(product))
    }
    return products.filter((product) => (
      isPosSellable(product)
      && isProductAvailableAtBranch(product, pendingLead.branchId)
    ))
  }, [products, pendingLead?.branchId])

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
    () => customersForOpportunityBranch(activeCustomers, pendingLead?.branchId),
    [activeCustomers, pendingLead?.branchId],
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
    if (!pendingLead || pendingLead.customerId) return
    const match = resolveCustomerForLead(pendingLead, activeCustomers)
    if (!match) return
    updateLead(pendingLead.id, { customerId: match.id }).catch(() => {})
  }, [pendingLead, activeCustomers, updateLead])

  const customerById = useMemo(
    () => new Map(visibleCustomers.map((customer) => [customer.id, customer])),
    [visibleCustomers],
  )

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim()
    return pipelineLeads.filter((lead) => {
      if (!matchesBranches(
        lead,
        branchIds,
        (row) => (row.branchId ? [row.branchId] : []),
      )) return false
      if (!q) return true
      const customer = lead.customerId ? customerById.get(lead.customerId) : null
      return leadMatchesQuery(lead, { customer }, q)
    })
  }, [pipelineLeads, branchIds, searchQuery, customerById])

  const byStage = useMemo(() => {
    const map = Object.fromEntries(OPPORTUNITY_STAGES.map((stage) => [stage, []]))
    filteredLeads.forEach((lead) => {
      const stage = leadPipelineStage(lead)
      if (map[stage]) map[stage].push(lead)
    })
    return map
  }, [filteredLeads])

  const totals = useMemo(() => {
    const open = pipelineLeads.filter((lead) => !['cerrado', 'perdido'].includes(lead.status))
    return { count: open.length, value: open.reduce((total, lead) => total + (lead.pipelineValue || 0), 0) }
  }, [pipelineLeads])

  const handleStageMove = async (leadId, stage) => {
    if (stage === 'cerrado') {
      const lead = pipelineLeads.find((item) => item.id === leadId)
      if (!lead) return
      if (!canInvoice) {
        setPendingClose(lead)
        setElevationOpen(true)
        return
      }
      setPendingClose(lead)
      setClosePaymentMethod('efectivo')
      return
    }

    setBusyLeadId(leadId)
    try {
      await updateLeadStage(leadId, stage)
      toast.success(`Movido a ${STAGE_META[stage].label}`)
    } catch (error) {
      toast.error(error.message || 'No se pudo mover el lead')
    } finally {
      setBusyLeadId(null)
    }
  }

  const ensureCloseCustomerLinked = async (lead) => {
    const customerId = effectiveLeadCustomerId(lead, activeCustomers)
    if (!customerId || lead.customerId) return customerId
    await updateLead(lead.id, { customerId })
    return customerId
  }

  const resolveCloseQuoteCustomerId = async (lead) => {
    const linked = await ensureCloseCustomerLinked(lead)
    if (linked) return linked
    const ensured = await ensureCustomerForQuote({
      customerId: null,
      lead,
      addCustomer: useCustomersStore.getState().addCustomer,
      updateLead,
    })
    return ensured?.id || null
  }

  const handleCloseCreateQuote = async (payload) => {
    if (!pendingLead) return
    setCloseQuoteBusy(true)
    try {
      const customerId = payload.customerId || await resolveCloseQuoteCustomerId(pendingLead)
      if (!customerId) {
        toast.error('El lead necesita nombre y sucursal para crear el cliente al cotizar.')
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

  const handleCloseLinkQuote = async (quoteId, leadId) => {
    setCloseQuoteBusy(true)
    try {
      await updateQuote(quoteId, { leadId })
      toast.success('Cotización vinculada al lead')
    } catch (error) {
      toast.error(error.message || 'No se pudo vincular la cotización')
      throw error
    } finally {
      setCloseQuoteBusy(false)
    }
  }

  const confirmCloseWithInvoice = async ({ customerId } = {}) => {
    if (!pendingLead) return
    setBusyLeadId(pendingLead.id)
    try {
      const resolvedCustomerId = customerId
        || await resolveCloseQuoteCustomerId(pendingLead)
      const sale = await closeLeadWithInvoice(pendingLead.id, {
        paymentMethod: closePaymentMethod,
        customerId: resolvedCustomerId,
      })
      if (sale) {
        downloadSaleInvoicePdf(sale, { branches, settings, paymentMethods })
      }
      setPendingClose(null)
      toast.success('Lead cerrado y factura descargada')
    } catch (error) {
      toast.error(error.message || 'No se pudo facturar el lead')
    } finally {
      setBusyLeadId(null)
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
    isDisabled: Boolean(busyLeadId),
  })

  const linkableCustomers = linkingLead
    ? activeCustomers.filter((customer) => belongsToBranch(customer, linkingLead.branchId))
    : []

  const openNewQuote = () => {
    setNewQuoteContext({
      branchId: sessionBranchId || branches.find((branch) => branch.active)?.id || '',
    })
    setNewQuoteOpen(true)
  }

  const convertPipelineLead = async (lead) => {
    if (!lead?.id) return
    setBusyLeadId(lead.id)
    try {
      await convertToCustomer(lead.id)
      toast.success('Lead convertido y vinculado al cliente')
    } catch (error) {
      toast.error(error.message || 'No se pudo convertir el lead')
    } finally {
      setBusyLeadId(null)
    }
  }

  const openLinkCustomer = (lead) => {
    setLinkingLead(lead)
    setLinkCustomerId('')
  }

  const openFollowUp = (lead) => {
    setFollowUpLeadId(lead.id)
    setFollowUpModalOpen(true)
  }

  const openCreateCustomerForLink = () => {
    if (!linkingLead) return
    setCustomerFormDefaults(leadCustomerDefaults(linkingLead))
    setCustomerFormTarget('link')
    setCustomerFormOpen(true)
  }

  const attachCustomerToLead = async (lead, customer, { closeLinkModal = true } = {}) => {
    if (!lead?.id || !customer?.id) return
    setBusyLeadId(lead.id)
    try {
      await updateLead(lead.id, { customerId: customer.id })
      toast.success('Cliente vinculado al lead')
      if (closeLinkModal) {
        setLinkingLead(null)
        setLinkCustomerId('')
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo vincular el cliente')
    } finally {
      setBusyLeadId(null)
    }
  }

  const openCreateCustomerForClose = () => {
    if (!pendingLead) return
    setCustomerFormDefaults(leadCustomerDefaults(pendingLead))
    setCustomerFormTarget('close-invoice')
    setCustomerFormOpen(true)
  }

  const linkCustomerOnClose = async (customerId) => {
    const customer = activeCustomers.find((item) => item.id === customerId)
    if (!customer || !pendingLead) {
      toast.error('Selecciona un cliente válido')
      return
    }
    await attachCustomerToLead(pendingLead, customer, { closeLinkModal: false })
  }

  const convertLeadForClose = async () => {
    if (!pendingLead?.id) return
    setCloseConvertBusy(true)
    try {
      const customer = await convertToCustomer(pendingLead.id)
      if (customer?.id) {
        await attachCustomerToLead(pendingLead, customer, { closeLinkModal: false })
      }
      toast.success('Lead convertido a cliente')
    } catch (error) {
      toast.error(error.message || 'No se pudo convertir el lead')
    } finally {
      setCloseConvertBusy(false)
    }
  }

  const handleCustomerCreated = async (customer) => {
    if (customerFormTarget === 'close-invoice' && pendingLead) {
      await attachCustomerToLead(pendingLead, customer, { closeLinkModal: false })
      return
    }
    if (customerFormTarget === 'link' && linkingLead) {
      await attachCustomerToLead(linkingLead, customer)
    }
  }

  const linkCustomer = async () => {
    const customer = linkableCustomers.find((item) => item.id === linkCustomerId)
    if (!customer || !linkingLead) return toast.error('Selecciona un cliente de la misma sucursal')
    await attachCustomerToLead(linkingLead, customer)
  }

  const toolbarRef = useRef(null)
  const boardHorizontalScrollRef = useRef(null)
  const boardVerticalScrollRef = useRef(null)
  const [boardViewportHeight, setBoardViewportHeight] = useState(0)
  const leadsListMeta = useCrmStore((state) => state.leadsListMeta)
  const loadMorePipelineLeads = useCrmStore((state) => state.loadMorePipelineLeads)
  const online = useSessionStore((state) => state.status === 'online')
  const leadsHasMore = online && leadsListMeta.page < leadsListMeta.totalPages

  const pipelineScrollSentinelRef = useInfiniteScroll({
    hasMore: leadsHasMore,
    loading: leadsListMeta.loadingMore,
    onLoadMore: () => { loadMorePipelineLeads().catch(() => {}) },
    rootRef: boardVerticalScrollRef,
    rootMargin: '240px',
  })

  useLayoutEffect(() => {
    const node = boardHorizontalScrollRef.current
    if (!node) return undefined
    const update = () => setBoardViewportHeight(node.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

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
            <p className="text-sm text-slate-500">
              {totals.count} leads abiertos · {formatDOP(totals.value)}
              {searchQuery.trim() && (
                <> · {filteredLeads.length} coincidencia{filteredLeads.length === 1 ? '' : 's'}</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BranchMultiSelect
              branches={branches}
              branchIds={branchIds}
              onChange={setBranchIds}
              className={CRM_BRANCH_FILTER_CLASS}
              testId="pipeline-branch-filter"
            />
            <Button onClick={openNewQuote} disabled={!can.quote}>
              <Plus className="h-4 w-4" /> Nueva cotización
            </Button>
          </div>
        </div>
        <div className="relative mt-4 w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar por nombre, teléfono, documento, ID…"
            className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-600"
            data-testid="pipeline-search"
          />
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
              ref={boardVerticalScrollRef}
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
                        {deals.map((lead) => (
                          <DealCard
                            key={lead.id}
                            lead={lead}
                            busy={busyLeadId === lead.id}
                            dragging={dragState?.id === lead.id}
                            onPointerDown={startDrag}
                            onFollowUp={openFollowUp}
                            onQuote={(item) => navigate(`/crm/cotizaciones?leadId=${item.id}`)}
                            onConvert={convertPipelineLead}
                            onLinkCustomer={openLinkCustomer}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div ref={pipelineScrollSentinelRef} className="h-1 w-full shrink-0" aria-hidden />
              {online && (
                <IncrementalListFooter
                  loaded={pipelineLeads.length}
                  total={leadsListMeta.totalItems}
                  loading={leadsListMeta.loadingMore}
                  hasMore={leadsHasMore}
                  className="shrink-0"
                />
              )}
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

      <QuoteFormModal
        open={newQuoteOpen}
        onClose={() => {
          setNewQuoteOpen(false)
          setNewQuoteContext(null)
        }}
        initialContext={newQuoteContext}
        onSaved={() => {
          setNewQuoteOpen(false)
          setNewQuoteContext(null)
        }}
      />

      <CloseLeadInvoiceModal
        open={Boolean(pendingLead) && canInvoice}
        onClose={() => {
          setPendingClose(null)
          setCloseQuoteFormOpen(false)
        }}
        lead={pendingLead}
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
        onConvertLead={pendingLead ? convertLeadForClose : undefined}
        onOpenQuoteBuilder={() => setCloseQuoteFormOpen(true)}
        documentCtx={closeDocumentCtx}
        loading={busyLeadId === pendingLead?.id}
        quoteBusy={closeQuoteBusy}
        convertLeadBusy={closeConvertBusy}
      />

      <QuoteFormModal
        open={closeQuoteFormOpen}
        onClose={() => setCloseQuoteFormOpen(false)}
        initialContext={pendingLead ? { leadId: pendingLead.id } : null}
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
        open={Boolean(linkingLead)}
        onClose={() => setLinkingLead(null)}
        title="Vincular cliente"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Selecciona un cliente de la sucursal de {linkingLead ? leadDisplayTitle(linkingLead) : ''}. Después podrás generar su cotización.
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
            <Button variant="secondary" onClick={() => setLinkingLead(null)}>Cancelar</Button>
            <Button onClick={linkCustomer} disabled={!linkCustomerId || Boolean(busyLeadId)}>
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
          setFollowUpLeadId('')
        }}
        defaultLeadId={followUpLeadId}
      />
    </div>
  )
}
