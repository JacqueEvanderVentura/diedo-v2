import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarPlus,
  CalendarClock,
  Copy,
  CreditCard,
  Instagram,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { WhatsAppMenuButton } from '@/components/ui/WhatsAppMenuButton'
import { useCrmStore } from '@/stores/crmStore'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCatalogStore, isPosSellable } from '@/stores/catalogStore'
import { buildLeadWhatsAppVariables } from '@/lib/whatsapp'
import { customersVisibleToSession } from '@/lib/customerScope'
import { isProductAvailableAtBranch } from '@/lib/catalogSync'
import { CloseLeadInvoiceModal } from '@/modules/crm/components/CloseOpportunityInvoiceModal'
import { PermissionElevationModal } from '@/components/auth/PermissionElevationModal'
import { LeadConvertModal } from '@/modules/crm/components/LeadConvertModal'
import { leadHasDocument } from '@/modules/crm/lib/leadConversion'
import { QuoteFormModal } from '@/modules/crm/components/QuoteFormModal'
import { AppointmentFormModal } from '@/modules/agenda/components/AppointmentFormModal'
import { downloadSaleInvoicePdf } from '@/modules/crm/lib/sales'
import { findBillableQuote, PIPELINE_INVOICE_PERMISSION, syncPipelineCloseCustomer } from '@/modules/crm/lib/pipelineInvoice'
import { listCheckoutPaymentMethods } from '@/modules/crm/lib/quoteInvoice'
import {
  effectiveLeadCustomerId,
  resolveCustomerForLead,
} from '@/modules/crm/lib/leadCustomer'
import {
  ensureCustomerForQuote,
  isLeadNeedsDocumentError,
  preparePipelineCloseCustomer,
} from '@/modules/crm/lib/quoteCustomer'
import { SIMPLIFIED_LOST_REASONS } from '@/modules/crm/lib/lostReasons'
import { useCrmCapabilities } from '@/modules/crm/hooks/useCrmCapabilities'
import { formatLeadOfferText, resolveInstagramUrl } from '@/modules/crm/lib/simplifiedOffer'
import {
  SIMPLIFIED_STAGE_LOST_OPTION_VALUE,
  SIMPLIFIED_DIRECT_MOVE_STAGES,
  SIMPLIFIED_STAGE_TABS,
  simplifiedStageSelectOptions,
} from '@/modules/crm/lib/simplifiedStageMove'

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function SimplifiedLeadActions({
  lead,
  onActionComplete,
  onQuoteSaved,
  requestPaymentForId = null,
  onPaymentRequestHandled,
  onStageMove,
}) {
  const branches = useConfigStore((state) => state.branches)
  const settings = useConfigStore((state) => state.settings)
  const paymentMethods = useConfigStore((state) => state.paymentMethods)
  const customers = useCustomersStore((state) => state.customers)
  const sessionUser = useSessionStore((state) => state.user)
  const products = useCatalogStore((state) => state.products)
  const quotes = useCrmStore((state) => state.quotes)
  const storeLeads = useCrmStore((state) => state.leads)
  const applySimplifiedFollowUp = useCrmStore((state) => state.applySimplifiedFollowUp)
  const applySimplifiedLost = useCrmStore((state) => state.applySimplifiedLost)
  const closeLeadWithInvoice = useCrmStore((state) => state.closeLeadWithInvoice)
  const closeLeadWithoutInvoice = useCrmStore((state) => state.closeLeadWithoutInvoice)
  const convertToCustomer = useCrmStore((state) => state.convertToCustomer)
  const fetchLeadQuotes = useCrmStore((state) => state.fetchLeadQuotes)
  const addQuote = useCrmStore((state) => state.addQuote)
  const updateQuote = useCrmStore((state) => state.updateQuote)
  const updateLead = useCrmStore((state) => state.updateLead)
  const canInvoice = useSessionStore((state) => state.hasPermission(PIPELINE_INVOICE_PERMISSION))
  const can = useCrmCapabilities()

  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpForm, setFollowUpForm] = useState({ title: 'Seguimiento comercial', description: '', dueAt: '' })
  const [followUpBusy, setFollowUpBusy] = useState(false)

  const [lostOpen, setLostOpen] = useState(false)
  const [lostReason, setLostReason] = useState(SIMPLIFIED_LOST_REASONS[0])
  const [lostBusy, setLostBusy] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenStage, setReopenStage] = useState('propuesta')
  const [reopenBusy, setReopenBusy] = useState(false)
  const [stageBusy, setStageBusy] = useState(false)

  const [appointmentOpen, setAppointmentOpen] = useState(false)
  const [appointmentCustomerId, setAppointmentCustomerId] = useState('')
  const [appointmentBusy, setAppointmentBusy] = useState(false)

  const [pendingClose, setPendingClose] = useState(false)
  const [closePaymentMethod, setClosePaymentMethod] = useState('')
  const [elevationOpen, setElevationOpen] = useState(false)
  const [closeQuoteBusy, setCloseQuoteBusy] = useState(false)
  const [closeConvertBusy, setCloseConvertBusy] = useState(false)
  const [closeQuoteFormOpen, setCloseQuoteFormOpen] = useState(false)
  const [busyClose, setBusyClose] = useState(false)
  const [convertPurpose, setConvertPurpose] = useState(null)

  const liveLead = useMemo(
    () => storeLeads.find((item) => item.id === lead?.id) || lead,
    [storeLeads, lead],
  )

  const visibleCustomers = useMemo(
    () => customersVisibleToSession(customers, sessionUser),
    [customers, sessionUser],
  )

  const activeCustomers = useMemo(
    () => visibleCustomers.filter((customer) => !customer.isDefault && customer.active !== false),
    [visibleCustomers],
  )

  const closeCatalogProducts = useMemo(() => {
    if (!liveLead?.branchId) {
      return products.filter((product) => isPosSellable(product))
    }
    return products.filter((product) => (
      isPosSellable(product)
      && isProductAvailableAtBranch(product, liveLead.branchId)
    ))
  }, [products, liveLead?.branchId])

  const closeDocumentCtx = useMemo(
    () => ({
      branches,
      settings,
      paymentMethods,
      customers: activeCustomers,
    }),
    [branches, settings, paymentMethods, activeCustomers],
  )

  const linkedCustomer = useMemo(
    () => resolveCustomerForLead(liveLead, activeCustomers, quotes),
    [liveLead, activeCustomers, quotes],
  )

  const offerText = useMemo(
    () => formatLeadOfferText(
      quotes,
      liveLead?.id,
      { customerName: linkedCustomer?.name || liveLead?.company || liveLead?.name || lead?.name || '' },
    ),
    [quotes, liveLead?.id, liveLead?.company, liveLead?.name, linkedCustomer?.name, lead?.name],
  )

  const instagramUrl = resolveInstagramUrl(lead)
    || resolveInstagramUrl(activeCustomers.find((item) => item.id === liveLead?.customerId))

  const pendingInvoiceQuote = useMemo(() => {
    const quote = findBillableQuote(quotes, liveLead?.id)
    if (!quote || quote.convertedSaleId) return null
    return quote
  }, [quotes, liveLead?.id])

  const leadHasSale = useMemo(
    () => quotes.some((quote) => quote.leadId === liveLead?.id && quote.convertedSaleId),
    [quotes, liveLead?.id],
  )

  const closeModalOpen = pendingClose && canInvoice
  const liveLeadId = liveLead?.id
  const liveLeadStatus = liveLead?.status

  useEffect(() => {
    if (!elevationOpen && pendingClose && !canInvoice) {
      setPendingClose(false)
    }
  }, [elevationOpen, pendingClose, canInvoice])

  useEffect(() => {
    if (!liveLeadId || !(closeModalOpen || liveLeadStatus === 'cerrado')) return
    fetchLeadQuotes?.(liveLeadId)?.catch?.(() => {})
  }, [closeModalOpen, liveLeadId, liveLeadStatus, fetchLeadQuotes])

  const defaultPaymentMethodId = () => listCheckoutPaymentMethods(paymentMethods)[0]?.id || ''

  useEffect(() => {
    if (!requestPaymentForId || requestPaymentForId !== liveLead?.id) return
    if (!canInvoice) {
      setPendingClose(true)
      setElevationOpen(true)
    } else {
      setPendingClose(true)
      setClosePaymentMethod(listCheckoutPaymentMethods(paymentMethods)[0]?.id || '')
    }
    onPaymentRequestHandled?.()
  }, [requestPaymentForId, liveLead?.id, canInvoice, onPaymentRequestHandled, paymentMethods])

  if (!liveLead) return null

  const reopenModal = (
    <Modal
      open={reopenOpen}
      onClose={() => !reopenBusy && setReopenOpen(false)}
      title="Reabrir oportunidad"
      testId="crm-simplified-reopen-modal"
    >
      <div className="space-y-4">
        <p>Elige la etapa a la que regresará esta oportunidad.</p>
        <Select
          value={reopenStage}
          onChange={setReopenStage}
          options={SIMPLIFIED_STAGE_TABS
            .filter((tab) => SIMPLIFIED_DIRECT_MOVE_STAGES.includes(tab.id))
            .map((tab) => ({ value: tab.id, label: tab.label }))}
          data-testid="crm-simplified-reopen-stage"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={reopenBusy} onClick={() => setReopenOpen(false)}>Cancelar</Button>
          <Button
            disabled={reopenBusy}
            data-testid="crm-simplified-reopen-confirm"
            onClick={async () => {
              setReopenBusy(true)
              try {
                await updateLead(liveLead.id, { status: reopenStage })
                toast.success('Oportunidad reabierta')
                setReopenOpen(false)
                onActionComplete?.(reopenStage)
              } catch (error) {
                toast.error(error.message || 'No se pudo reabrir la oportunidad')
              } finally {
                setReopenBusy(false)
              }
            }}
          >
            {reopenBusy ? 'Reabriendo…' : 'Confirmar reapertura'}
          </Button>
        </div>
      </div>
    </Modal>
  )

  const reopenButton = can.manage && !leadHasSale ? (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        setReopenStage('propuesta')
        setReopenOpen(true)
      }}
      data-testid="crm-simplified-reopen"
    >
      Reabrir oportunidad
    </Button>
  ) : null

  const openPayment = () => {
    if (!canInvoice) {
      setPendingClose(true)
      setElevationOpen(true)
      return
    }
    setPendingClose(true)
    setClosePaymentMethod(defaultPaymentMethodId())
  }

  const closeInvoiceModal = (
    <CloseLeadInvoiceModal
      open={closeModalOpen}
      onClose={() => {
        setPendingClose(false)
        setCloseQuoteFormOpen(false)
      }}
      lead={liveLead}
      quotes={quotes}
      branches={branches}
      customers={activeCustomers}
      products={closeCatalogProducts}
      paymentMethods={paymentMethods}
      paymentMethod={closePaymentMethod}
      onPaymentMethodChange={setClosePaymentMethod}
      onCreateQuote={(payload) => handleCloseCreateQuote(payload)}
      onLinkQuote={(quoteId, leadId) => handleCloseLinkQuote(quoteId, leadId)}
      onConfirm={(payload) => confirmCloseWithInvoice(payload)}
      onLinkCustomer={(customerId) => linkCustomerOnClose(customerId)}
      onConvertLead={liveLead?.id ? () => convertLeadForClose() : undefined}
      onCloseWithoutInvoice={liveLead.status !== 'cerrado' ? (payload) => closeWithoutInvoice(payload) : undefined}
      onOpenQuoteBuilder={() => setCloseQuoteFormOpen(true)}
      documentCtx={closeDocumentCtx}
      loading={busyClose}
      quoteBusy={closeQuoteBusy}
      convertLeadBusy={closeConvertBusy}
    />
  )

  const elevationModal = (
    <PermissionElevationModal
      open={elevationOpen}
      onClose={() => setElevationOpen(false)}
      permissionCode={PIPELINE_INVOICE_PERMISSION}
      title="Autorizar facturación"
      description="Para registrar el pago y generar la factura, un supervisor debe autorizar el permiso de venta por 3 minutos."
      onElevated={() => {
        setClosePaymentMethod(defaultPaymentMethodId())
        setPendingClose(true)
      }}
    />
  )

  const ensureCloseCustomerLinked = async (pipelineLead) => {
    const customerId = effectiveLeadCustomerId(pipelineLead, quotes)
    if (!customerId || pipelineLead.customerId) return customerId
    await updateLead(pipelineLead.id, { customerId })
    return customerId
  }

  const resolveCloseQuoteCustomerId = async (opp) => {
    const linked = await ensureCloseCustomerLinked(opp)
    if (linked) return linked
    try {
      const ensured = await ensureCustomerForQuote({
        customerId: null,
        lead: opp,
        convertToCustomer,
      })
      return ensured?.id || null
    } catch (error) {
      if (!isLeadNeedsDocumentError(error)) throw error
      setConvertPurpose('close')
      return null
    }
  }

  async function handleCloseCreateQuote(payload) {
    setCloseQuoteBusy(true)
    try {
      const customerId = payload.customerId || await resolveCloseQuoteCustomerId(liveLead)
      if (!customerId) {
        toast.message('Ingresa el documento del lead para crear el cliente y cotizar.')
        return
      }
      await addQuote({ ...payload, customerId })
      toast.success(payload.status === 'aceptada' ? 'Cotización aceptada' : 'Cotización creada')
      onQuoteSaved?.()
    } catch (error) {
      toast.error(error.message || 'No se pudo crear la cotización')
      throw error
    } finally {
      setCloseQuoteBusy(false)
    }
  }

  async function handleCloseLinkQuote(quoteId, leadId) {
    setCloseQuoteBusy(true)
    try {
      await updateQuote(quoteId, { leadId })
      toast.success('Cotización vinculada a la oportunidad')
      onQuoteSaved?.()
    } catch (error) {
      toast.error(error.message || 'No se pudo vincular la cotización')
      throw error
    } finally {
      setCloseQuoteBusy(false)
    }
  }

  async function confirmCloseWithInvoice({
    customerId,
    paymentMethod: methodOverride,
    collectionMode,
    reference,
    proof,
  } = {}) {
    setBusyClose(true)
    try {
      const resolvedCustomerId = customerId || await resolveCloseQuoteCustomerId(liveLead)
      if (!resolvedCustomerId) return
      const sale = await closeLeadWithInvoice(liveLead.id, {
        paymentMethod: methodOverride || closePaymentMethod,
        collectionMode,
        reference,
        proof,
        customerId: resolvedCustomerId,
      })
      if (sale) {
        downloadSaleInvoicePdf(sale, { branches, settings, paymentMethods })
      }
      setPendingClose(false)
      toast.success('Pago registrado y factura generada')
      onActionComplete?.('cerrado')
    } catch (error) {
      toast.error(error.message || 'No se pudo registrar el pago')
    } finally {
      setBusyClose(false)
    }
  }

  async function closeWithoutInvoice({ customerId } = {}) {
    setBusyClose(true)
    try {
      await closeLeadWithoutInvoice(liveLead.id, { customerId })
      setPendingClose(false)
      toast.success('Oportunidad cerrada como ganada')
      onActionComplete?.('cerrado')
    } finally {
      setBusyClose(false)
    }
  }

  async function convertLeadForClose() {
    if (!liveLead?.id) return
    if (!leadHasDocument(liveLead)) {
      setConvertPurpose('close')
      return
    }
    setCloseConvertBusy(true)
    try {
      await preparePipelineCloseCustomer({
        lead: liveLead,
        convertToCustomer,
        updateLead,
        updateQuote,
        quotes,
      })
      toast.success('Cliente listo para facturar')
    } catch (error) {
      toast.error(error.message || 'No se pudo preparar el cliente')
    } finally {
      setCloseConvertBusy(false)
    }
  }

  async function linkCustomerOnClose(customerId) {
    await syncPipelineCloseCustomer({
      leadId: liveLead.id,
      customerId,
      quotes,
      updateQuote,
      updateLead,
    })
    toast.success('Cliente vinculado a la oportunidad')
  }

  const handleLeadConverted = (customer) => {
    const purpose = convertPurpose
    setConvertPurpose(null)
    if (!customer?.id) return
    if (purpose === 'appointment') {
      setAppointmentCustomerId(customer.id)
      setAppointmentOpen(true)
      return
    }
    toast.success('Cliente listo para facturar')
  }

  if (['cerrado', 'perdido'].includes(liveLead.status)) {
    if (liveLead.status === 'cerrado' && pendingInvoiceQuote && can.manage) {
      return (
        <div className="space-y-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950" data-testid="crm-simplified-actions-pending-invoice">
          <p>
            Este lead está en <strong>Ganados</strong> pero aún no tiene factura registrada
            {pendingInvoiceQuote.number ? ` (cotización ${pendingInvoiceQuote.number})` : ''}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={openPayment}
              data-testid="crm-simplified-register-invoice"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Registrar factura
            </Button>
            {reopenButton}
          </div>
          {reopenModal}
          {closeInvoiceModal}
          {elevationModal}
        </div>
      )
    }
    return (
      <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600" data-testid="crm-simplified-actions-closed">
        {liveLead.status === 'perdido' ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Motivo de pérdida</p>
              <p className="mt-1 font-medium text-slate-800">{liveLead.lostReason || 'Sin motivo registrado'}</p>
              {liveLead.pipelineClosedAt && (
                <p className="mt-1 text-xs text-slate-500">
                  Fecha de pérdida: {new Date(liveLead.pipelineClosedAt).toLocaleString('es-DO')}
                </p>
              )}
            </div>
            {reopenButton}
          </div>
        ) : (
          <div className="space-y-3">
            <p>
              {leadHasSale
                ? 'Esta oportunidad está ganada y tiene una venta registrada.'
                : 'Esta oportunidad está ganada sin factura registrada.'}
            </p>
            {reopenButton}
          </div>
        )}
        {instagramUrl && (
          <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline" data-testid="crm-simplified-ig">
            <Instagram className="h-3.5 w-3.5" /> IG
          </a>
        )}
        {reopenModal}
      </div>
    )
  }

  const handleStageSelect = async (nextStage) => {
    if (!liveLead || stageBusy) return
    if (nextStage === liveLead.status) return
    if (nextStage === SIMPLIFIED_STAGE_LOST_OPTION_VALUE) {
      setLostOpen(true)
      return
    }
    if (nextStage === 'cerrado') {
      openPayment()
      return
    }
    if (!onStageMove) return
    setStageBusy(true)
    try {
      await onStageMove(liveLead.id, nextStage)
    } finally {
      setStageBusy(false)
    }
  }

  const submitFollowUp = async () => {
    if (!followUpForm.dueAt) return toast.error('Selecciona fecha y hora del seguimiento')
    setFollowUpBusy(true)
    try {
      await applySimplifiedFollowUp(liveLead.id, {
        dueAt: followUpForm.dueAt,
        title: followUpForm.title.trim() || 'Seguimiento programado',
        description: followUpForm.description.trim(),
      })
      toast.success('Seguimiento programado')
      setFollowUpOpen(false)
      onActionComplete?.('negociacion')
    } catch (error) {
      toast.error(error.message || 'No se pudo programar el seguimiento')
    } finally {
      setFollowUpBusy(false)
    }
  }

  const submitLost = async () => {
    setLostBusy(true)
    try {
      await applySimplifiedLost(liveLead.id, lostReason)
      toast.success('Oportunidad marcada como perdida')
      setLostOpen(false)
      onActionComplete?.('perdido')
    } catch (error) {
      toast.error(error.message || 'No se pudo marcar como perdida')
    } finally {
      setLostBusy(false)
    }
  }

  const openAppointment = async () => {
    const customerId = effectiveLeadCustomerId(liveLead, quotes)
    if (customerId) {
      setAppointmentCustomerId(customerId)
      setAppointmentOpen(true)
      return
    }
    if (!leadHasDocument(liveLead)) {
      setConvertPurpose('appointment')
      return
    }
    setAppointmentBusy(true)
    try {
      const customer = await convertToCustomer(liveLead.id)
      if (!customer?.id) return
      setAppointmentCustomerId(customer.id)
      setAppointmentOpen(true)
    } catch (error) {
      toast.error(error.message || 'No se pudo preparar el cliente para la cita')
    } finally {
      setAppointmentBusy(false)
    }
  }

  const copyOffer = async () => {
    if (!offerText) {
      toast.error('No hay cotización vinculada para copiar')
      return
    }
    try {
      await navigator.clipboard.writeText(offerText)
      toast.success('Oferta copiada al portapapeles')
    } catch {
      toast.error('No se pudo copiar la oferta')
    }
  }

  const openInstagram = () => {
    if (!instagramUrl) {
      toast.error('No hay enlace de Instagram en el lead')
      return
    }
    window.open(instagramUrl, '_blank', 'noopener,noreferrer')
  }

  const defaultFollowUpDue = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    return toLocalInput(d.toISOString())
  }

  return (
    <div className="space-y-4" data-testid="crm-simplified-actions">
      <div className="flex flex-wrap gap-2 max-w-full">
        {lead?.phone && (
          <WhatsAppMenuButton
            phone={lead.phone}
            context="oportunidades"
            size="sm"
            variables={buildLeadWhatsAppVariables(lead, { sellerName: settings?.businessName, branches })}
            data-testid="crm-simplified-wa"
          />
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={openInstagram}
          disabled={!instagramUrl}
          data-testid="crm-simplified-ig"
        >
          <Instagram className="h-3.5 w-3.5" />
          Instagram
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={copyOffer}
          disabled={!offerText}
          data-testid="crm-simplified-copy-offer"
        >
          <Copy className="h-3.5 w-3.5" />
          Copiar oferta
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-[4.25rem] flex-col items-center justify-center gap-1.5 px-2 py-3 text-center text-xs leading-snug sm:text-sm"
          onClick={() => {
            setFollowUpForm((current) => ({
              ...current,
              dueAt: current.dueAt || defaultFollowUpDue(),
            }))
            setFollowUpOpen(true)
          }}
          data-testid="crm-simplified-follow-up"
        >
          <CalendarClock className="h-4 w-4 shrink-0" />
          Programar seguimiento
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-[4.25rem] flex-col items-center justify-center gap-1.5 px-2 py-3 text-center text-xs leading-snug sm:text-sm"
          onClick={openPayment}
          data-testid="crm-simplified-payment"
        >
          <CreditCard className="h-4 w-4 shrink-0" />
          Registrar pago
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-[4.25rem] flex-col items-center justify-center gap-1.5 px-2 py-3 text-center text-xs leading-snug sm:text-sm"
          onClick={openAppointment}
          disabled={appointmentBusy}
          data-testid="crm-simplified-appointment"
        >
          <CalendarPlus className="h-4 w-4 shrink-0" />
          {appointmentBusy ? 'Preparando…' : 'Agendar primera cita'}
        </Button>
        <div className="flex min-h-[4.25rem] flex-col justify-center rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm">
          <Select
            value={liveLead.status}
            onChange={handleStageSelect}
            disabled={stageBusy}
            options={simplifiedStageSelectOptions()}
            data-testid="crm-simplified-stage"
          />
        </div>
      </div>

      <Modal
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        title="Programar seguimiento"
        testId="crm-simplified-follow-up-modal"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Título</label>
            <Input
              value={followUpForm.title}
              onChange={(event) => setFollowUpForm((f) => ({ ...f, title: event.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Notas</label>
            <Input
              value={followUpForm.description}
              onChange={(event) => setFollowUpForm((f) => ({ ...f, description: event.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Fecha y hora</label>
            <Input
              type="datetime-local"
              value={followUpForm.dueAt}
              onChange={(event) => setFollowUpForm((f) => ({ ...f, dueAt: event.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFollowUpOpen(false)}>Cancelar</Button>
            <Button onClick={submitFollowUp} disabled={followUpBusy}>
              {followUpBusy ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Marcar como perdido"
        testId="crm-simplified-lost-modal"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Registra el motivo real para mejorar reportes de conversión.</p>
          <Select
            value={lostReason}
            onChange={setLostReason}
            options={SIMPLIFIED_LOST_REASONS.map((reason) => ({ value: reason, label: reason }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLostOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={submitLost} disabled={lostBusy}>
              {lostBusy ? 'Guardando…' : 'Confirmar pérdida'}
            </Button>
          </div>
        </div>
      </Modal>

      {closeInvoiceModal}

      <QuoteFormModal
        open={closeQuoteFormOpen}
        onClose={() => setCloseQuoteFormOpen(false)}
        initialContext={{ leadId: liveLead.id }}
        onSaved={() => {
          setCloseQuoteFormOpen(false)
          toast.success('Cotización guardada; ya puedes facturar')
          onQuoteSaved?.()
        }}
      />

      {elevationModal}

      <LeadConvertModal
        open={Boolean(convertPurpose)}
        lead={liveLead}
        forPipelineClose={convertPurpose === 'close'}
        onClose={() => setConvertPurpose(null)}
        onConverted={handleLeadConverted}
      />

      <AppointmentFormModal
        open={appointmentOpen}
        onClose={() => setAppointmentOpen(false)}
        defaultCustomerId={appointmentCustomerId}
        defaultSlot={{ branchId: liveLead.branchId }}
      />
    </div>
  )
}
