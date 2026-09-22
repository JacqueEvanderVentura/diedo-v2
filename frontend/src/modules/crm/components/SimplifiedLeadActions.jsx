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
import { CloseOpportunityInvoiceModal } from '@/modules/crm/components/CloseOpportunityInvoiceModal'
import { PermissionElevationModal } from '@/components/auth/PermissionElevationModal'
import { CustomerFormModal } from '@/modules/crm/components/CustomerFormModal'
import { QuoteFormModal } from '@/modules/crm/components/QuoteFormModal'
import { AppointmentFormModal } from '@/modules/agenda/components/AppointmentFormModal'
import { downloadSaleInvoicePdf } from '@/modules/crm/lib/sales'
import { PIPELINE_INVOICE_PERMISSION } from '@/modules/crm/lib/pipelineInvoice'
import {
  effectiveOpportunityCustomerId,
  resolveCustomerForOpportunity,
} from '@/modules/crm/lib/opportunityCustomer'
import { customersForOpportunityBranch, opportunityCustomerDefaults } from '@/modules/crm/lib/pipelineForm'
import { ensureCustomerForQuote } from '@/modules/crm/lib/quoteCustomer'
import { SIMPLIFIED_LOST_REASONS } from '@/modules/crm/lib/lostReasons'
import { formatOpportunityOfferText, resolveInstagramUrl } from '@/modules/crm/lib/simplifiedOffer'
import {
  SIMPLIFIED_STAGE_LOST_OPTION_VALUE,
  simplifiedStageSelectOptions,
} from '@/modules/crm/lib/simplifiedStageMove'

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function SimplifiedLeadActions({
  opportunity,
  lead,
  onActionComplete,
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
  const opportunities = useCrmStore((state) => state.opportunities)
  const applySimplifiedFollowUp = useCrmStore((state) => state.applySimplifiedFollowUp)
  const applySimplifiedLost = useCrmStore((state) => state.applySimplifiedLost)
  const closeOpportunityWithInvoice = useCrmStore((state) => state.closeOpportunityWithInvoice)
  const addQuote = useCrmStore((state) => state.addQuote)
  const updateQuote = useCrmStore((state) => state.updateQuote)
  const updateOpportunity = useCrmStore((state) => state.updateOpportunity)
  const convertToCustomer = useCrmStore((state) => state.convertToCustomer)
  const canInvoice = useSessionStore((state) => state.hasPermission(PIPELINE_INVOICE_PERMISSION))

  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpForm, setFollowUpForm] = useState({ title: 'Seguimiento comercial', description: '', dueAt: '' })
  const [followUpBusy, setFollowUpBusy] = useState(false)

  const [lostOpen, setLostOpen] = useState(false)
  const [lostReason, setLostReason] = useState(SIMPLIFIED_LOST_REASONS[0])
  const [lostBusy, setLostBusy] = useState(false)
  const [stageBusy, setStageBusy] = useState(false)

  const [appointmentOpen, setAppointmentOpen] = useState(false)
  const [appointmentCustomerId, setAppointmentCustomerId] = useState('')

  const [pendingClose, setPendingClose] = useState(false)
  const [closePaymentMethod, setClosePaymentMethod] = useState('efectivo')
  const [elevationOpen, setElevationOpen] = useState(false)
  const [closeQuoteBusy, setCloseQuoteBusy] = useState(false)
  const [closeConvertBusy, setCloseConvertBusy] = useState(false)
  const [closeQuoteFormOpen, setCloseQuoteFormOpen] = useState(false)
  const [busyClose, setBusyClose] = useState(false)
  const [customerFormOpen, setCustomerFormOpen] = useState(false)
  const [customerFormDefaults, setCustomerFormDefaults] = useState(null)

  const liveOpportunity = useMemo(
    () => opportunities.find((item) => item.id === opportunity?.id) || opportunity,
    [opportunities, opportunity],
  )

  const visibleCustomers = useMemo(
    () => customersVisibleToSession(customers, sessionUser),
    [customers, sessionUser],
  )

  const activeCustomers = useMemo(
    () => visibleCustomers.filter((customer) => !customer.isDefault && customer.active !== false),
    [visibleCustomers],
  )

  const closeLinkableCustomers = useMemo(
    () => customersForOpportunityBranch(activeCustomers, liveOpportunity?.branchId),
    [activeCustomers, liveOpportunity?.branchId],
  )

  const closeCatalogProducts = useMemo(() => {
    if (!liveOpportunity?.branchId) {
      return products.filter((product) => isPosSellable(product))
    }
    return products.filter((product) => (
      isPosSellable(product)
      && isProductAvailableAtBranch(product, liveOpportunity.branchId)
    ))
  }, [products, liveOpportunity?.branchId])

  const closeDocumentCtx = useMemo(
    () => ({
      branches,
      settings,
      paymentMethods,
      customers: activeCustomers,
    }),
    [branches, settings, paymentMethods, activeCustomers],
  )

  const offerText = useMemo(
    () => formatOpportunityOfferText(
      quotes,
      liveOpportunity?.id,
      { customerName: liveOpportunity?.customerName || lead?.name || '' },
    ),
    [quotes, liveOpportunity?.id, liveOpportunity?.customerName, lead?.name],
  )

  const instagramUrl = resolveInstagramUrl(lead)
    || resolveInstagramUrl(activeCustomers.find((item) => item.id === liveOpportunity?.customerId))

  useEffect(() => {
    if (!elevationOpen && pendingClose && !canInvoice) {
      setPendingClose(false)
    }
  }, [elevationOpen, pendingClose, canInvoice])

  useEffect(() => {
    if (!requestPaymentForId || requestPaymentForId !== liveOpportunity?.id) return
    if (!canInvoice) {
      setPendingClose(true)
      setElevationOpen(true)
    } else {
      setPendingClose(true)
      setClosePaymentMethod('efectivo')
    }
    onPaymentRequestHandled?.()
  }, [requestPaymentForId, liveOpportunity?.id, canInvoice, onPaymentRequestHandled])

  useEffect(() => {
    if (!liveOpportunity?.customerId) return
    const match = resolveCustomerForOpportunity(liveOpportunity, activeCustomers)
    if (!match) return
    const nextName = match.name || match.displayName || ''
    const currentName = liveOpportunity.customerName || ''
    if (liveOpportunity.customerId === match.id && currentName === nextName) return
    if (
      liveOpportunity.customerId === match.id
      && currentName
      && currentName !== lead?.company
      && currentName !== lead?.name
    ) return
    updateOpportunity(liveOpportunity.id, {
      customerId: match.id,
      customerName: nextName,
    }).catch(() => {})
  }, [
    liveOpportunity?.id,
    liveOpportunity?.customerId,
    liveOpportunity?.customerName,
    lead?.company,
    lead?.name,
    activeCustomers,
    updateOpportunity,
  ])

  if (!liveOpportunity) return null

  if (['cerrado', 'perdido'].includes(liveOpportunity.stage)) {
    return (
      <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600" data-testid="crm-simplified-actions-closed">
        <p>Esta oportunidad ya está cerrada. Cambia de etapa en el pipeline estándar si necesitas reabrirla.</p>
        {instagramUrl && (
          <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline" data-testid="crm-simplified-ig">
            <Instagram className="h-3.5 w-3.5" /> IG
          </a>
        )}
      </div>
    )
  }

  const displayName = liveOpportunity.customerName || lead?.name || lead?.company || ''

  const ensureCloseCustomerLinked = async (opp) => {
    const customerId = effectiveOpportunityCustomerId(opp, activeCustomers)
    if (!customerId || opp.customerId) return customerId
    const match = resolveCustomerForOpportunity(opp, activeCustomers)
    await updateOpportunity(opp.id, {
      customerId,
      customerName: match?.name || opp.customerName,
    })
    return customerId
  }

  const resolveCloseQuoteCustomerId = async (opp) => {
    const linked = await ensureCloseCustomerLinked(opp)
    if (linked) return linked
    const ensured = await ensureCustomerForQuote({
      customerId: null,
      opportunity: opp,
      addCustomer: useCustomersStore.getState().addCustomer,
      updateOpportunity,
    })
    return ensured?.id || null
  }

  const attachCustomer = async (customer) => {
    if (!customer?.id) return
    await updateOpportunity(liveOpportunity.id, {
      customerId: customer.id,
      customerName: customer.name,
    })
  }

  const openPayment = () => {
    if (!canInvoice) {
      setPendingClose(true)
      setElevationOpen(true)
      return
    }
    setPendingClose(true)
    setClosePaymentMethod('efectivo')
  }

  const handleStageSelect = async (nextStage) => {
    if (!liveOpportunity || stageBusy) return
    if (nextStage === liveOpportunity.stage) return
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
      await onStageMove(liveOpportunity.id, nextStage)
    } finally {
      setStageBusy(false)
    }
  }

  const handleCloseCreateQuote = async (payload) => {
    setCloseQuoteBusy(true)
    try {
      const customerId = payload.customerId || await resolveCloseQuoteCustomerId(liveOpportunity)
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
    setBusyClose(true)
    try {
      const resolvedCustomerId = customerId || await resolveCloseQuoteCustomerId(liveOpportunity)
      const sale = await closeOpportunityWithInvoice(liveOpportunity.id, {
        paymentMethod: closePaymentMethod,
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

  const convertLeadForClose = async () => {
    if (!liveOpportunity.leadId) return
    setCloseConvertBusy(true)
    try {
      const customer = await convertToCustomer(liveOpportunity.leadId)
      if (customer?.id) await attachCustomer(customer)
      toast.success('Lead convertido a cliente')
    } catch (error) {
      toast.error(error.message || 'No se pudo convertir el lead')
    } finally {
      setCloseConvertBusy(false)
    }
  }

  const openCreateCustomerForClose = () => {
    setCustomerFormDefaults(opportunityCustomerDefaults(liveOpportunity))
    setCustomerFormOpen(true)
  }

  const linkCustomerOnClose = async (customerId) => {
    const customer = activeCustomers.find((item) => item.id === customerId)
    if (!customer) {
      toast.error('Selecciona un cliente válido')
      return
    }
    await attachCustomer(customer)
  }

  const submitFollowUp = async () => {
    if (!followUpForm.dueAt) return toast.error('Selecciona fecha y hora del seguimiento')
    setFollowUpBusy(true)
    try {
      await applySimplifiedFollowUp(liveOpportunity.id, {
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
      await applySimplifiedLost(liveOpportunity.id, lostReason)
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
    let customerId = effectiveOpportunityCustomerId(liveOpportunity, activeCustomers)
    if (!customerId && liveOpportunity.leadId) {
      try {
        const customer = await convertToCustomer(liveOpportunity.leadId)
        customerId = customer?.id
        if (customerId) await attachCustomer(customer)
      } catch (error) {
        toast.error(error.message || 'Convierte el lead a cliente antes de agendar')
        return
      }
    }
    if (!customerId) {
      toast.error('Vincula o crea un cliente para agendar la cita')
      return
    }
    setAppointmentCustomerId(customerId)
    setAppointmentOpen(true)
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
          data-testid="crm-simplified-appointment"
        >
          <CalendarPlus className="h-4 w-4 shrink-0" />
          Agendar primera cita
        </Button>
        <div className="flex min-h-[4.25rem] flex-col justify-center rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm">
          <Select
            value={liveOpportunity.stage}
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

      <CloseOpportunityInvoiceModal
        open={pendingClose && canInvoice}
        onClose={() => {
          setPendingClose(false)
          setCloseQuoteFormOpen(false)
        }}
        opportunity={liveOpportunity}
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
        onConvertLead={liveOpportunity.leadId ? convertLeadForClose : undefined}
        onOpenQuoteBuilder={() => setCloseQuoteFormOpen(true)}
        documentCtx={closeDocumentCtx}
        loading={busyClose}
        quoteBusy={closeQuoteBusy}
        convertLeadBusy={closeConvertBusy}
      />

      <QuoteFormModal
        open={closeQuoteFormOpen}
        onClose={() => setCloseQuoteFormOpen(false)}
        initialContext={{ opportunityId: liveOpportunity.id }}
        onSaved={() => {
          setCloseQuoteFormOpen(false)
          toast.success('Cotización guardada; ya puedes facturar')
        }}
      />

      <PermissionElevationModal
        open={elevationOpen}
        onClose={() => setElevationOpen(false)}
        permissionCode={PIPELINE_INVOICE_PERMISSION}
        title="Autorizar facturación"
        description="Para registrar el pago y generar la factura, un supervisor debe autorizar el permiso de venta por 3 minutos."
        onElevated={() => {
          setClosePaymentMethod('efectivo')
          setPendingClose(true)
        }}
      />

      <CustomerFormModal
        open={customerFormOpen}
        onClose={() => {
          setCustomerFormOpen(false)
          setCustomerFormDefaults(null)
        }}
        defaults={customerFormDefaults}
        onCreated={async (customer) => {
          await attachCustomer(customer)
          setCustomerFormOpen(false)
        }}
      />

      <AppointmentFormModal
        open={appointmentOpen}
        onClose={() => setAppointmentOpen(false)}
        defaultCustomerId={appointmentCustomerId}
        defaultSlot={{ branchId: liveOpportunity.branchId }}
      />
    </div>
  )
}
