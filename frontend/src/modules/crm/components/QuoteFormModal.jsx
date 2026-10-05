import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, UserPlus, Package, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { useCatalogStore, isPosSellable } from '@/stores/catalogStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCrmStore } from '@/stores/crmStore'
import { isProductAvailableAtBranch } from '@/lib/catalogSync'
import { formatDOP } from '@/lib/format'
import { sumQuoteLines } from '../lib/pipelineInvoice'
import {
  draftFromLead,
  draftFromQuote,
  emptyQuoteDraft,
  emptyQuoteLine,
  isQuoteEditable,
  quoteLinesToItems,
} from '../lib/quoteForm'
import { CustomerFormModal } from './CustomerFormModal'
import { leadCustomerDefaults } from '../lib/pipelineForm'
import {
  ensureCustomerForLeadQuote,
  ensureCustomerForQuote,
  syncLeadPipelineValue,
} from '../lib/quoteCustomer'
import { QuotePartyPicker } from './QuotePartyPicker'
import { crmApi } from '@/services/crmApi'
import { mapLeadFromApi } from '@/services/adapters/crm'

export function QuoteFormModal({
  open,
  onClose,
  quote = null,
  initialContext = null,
  onSaved,
}) {
  const branches = useConfigStore((s) => s.branches)
  const customers = useCustomersStore((s) => s.customers)
  const addCustomer = useCustomersStore((s) => s.addCustomer)
  const products = useCatalogStore((s) => s.products)
  const catalogHydrated = useCatalogStore((s) => s.apiContext.hydrated)
  const hydrateCatalog = useCatalogStore((s) => s.hydrateFromApi)
  const isOnline = useSessionStore((s) => s.status === 'online')
  const leads = useCrmStore((s) => s.leads)
  const updateLead = useCrmStore((s) => s.updateLead)
  const addQuote = useCrmStore((s) => s.addQuote)
  const updateQuote = useCrmStore((s) => s.updateQuote)

  const [draft, setDraft] = useState(emptyQuoteDraft)
  const [saving, setSaving] = useState(false)
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [contextLead, setContextLead] = useState(null)

  const editing = Boolean(quote)
  const canManage = useSessionStore((s) => s.status === 'demo' || (s.hasPermission('crm.manage') && s.hasPermission('sales.quote.manage')))
  const editable = canManage && isQuoteEditable(quote)

  useEffect(() => {
    if (!open) return
    if (quote) {
      setDraft(draftFromQuote(quote))
      setContextLead(null)
      return
    }
    if (initialContext?.leadId) {
      const lead = leads.find((item) => item.id === initialContext.leadId)
      if (lead) {
        setContextLead(lead)
        setDraft(draftFromLead(lead))
        return
      }
      if (isOnline) {
        let cancelled = false
        crmApi.getLead(initialContext.leadId)
          .then((response) => {
            if (cancelled) return
            const fetched = mapLeadFromApi(response)
            setContextLead(fetched)
            setDraft(draftFromLead(fetched))
          })
          .catch(() => {
            if (cancelled) return
            setDraft({
              ...emptyQuoteDraft(),
              customerId: initialContext?.customerId || '',
              leadId: initialContext.leadId,
              partyType: 'lead',
              branchId: initialContext?.branchId || '',
            })
          })
        return () => { cancelled = true }
      }
    }
    setContextLead(null)
    setDraft({
      ...emptyQuoteDraft(),
      customerId: initialContext?.customerId || '',
      leadId: initialContext?.leadId || '',
      partyType: initialContext?.leadId ? 'lead' : (initialContext?.customerId ? 'customer' : ''),
      branchId: initialContext?.branchId || '',
    })
  }, [open, quote, initialContext, leads, isOnline])

  useEffect(() => {
    if (!open || !isOnline || catalogHydrated) return
    setCatalogLoading(true)
    hydrateCatalog(branches)
      .catch(() => {})
      .finally(() => setCatalogLoading(false))
  }, [open, isOnline, catalogHydrated, hydrateCatalog, branches])

  const selectedLead = useMemo(
    () => contextLead || leads.find((item) => item.id === draft.leadId),
    [contextLead, leads, draft.leadId],
  )
  const selectedCustomer = useMemo(
    () => customers.find((item) => item.id === draft.customerId),
    [customers, draft.customerId],
  )

  const sellableCatalog = useMemo(
    () => products.filter((product) => isPosSellable(product) && (!isOnline || product.apiSynced)),
    [products, isOnline],
  )
  const catalogById = useMemo(
    () => new Map(sellableCatalog.map((product) => [product.id, product])),
    [sellableCatalog],
  )

  const customerBranchIds = useMemo(() => {
    if (selectedCustomer?.branchIds?.length) return selectedCustomer.branchIds
    if (selectedCustomer?.branchId) return [selectedCustomer.branchId]
    if (selectedLead?.branchId) return [selectedLead.branchId]
    return null
  }, [selectedCustomer, selectedLead])

  const quoteBranches = useMemo(() => {
    const active = branches.filter((branch) => branch.active)
    if (selectedLead?.branchId) {
      return active.filter((branch) => branch.id === selectedLead.branchId)
    }
    if (customerBranchIds?.length) {
      return active.filter((branch) => customerBranchIds.includes(branch.id))
    }
    return active
  }, [branches, customerBranchIds, selectedLead])

  const branchPool = draft.branchId
    ? [draft.branchId]
    : customerBranchIds?.length
      ? customerBranchIds
      : quoteBranches.map((branch) => branch.id)

  const sellableForBranch = useMemo(
    () => sellableCatalog.filter((product) => (
      branchPool.length
        ? branchPool.some((branchId) => isProductAvailableAtBranch(product, branchId))
        : true
    )),
    [sellableCatalog, branchPool],
  )

  const partyValue = useMemo(() => {
    if (draft.partyType === 'lead' && draft.leadId) return { type: 'lead', id: draft.leadId }
    if (draft.partyType === 'customer' && draft.customerId) return { type: 'customer', id: draft.customerId }
    if (draft.customerId) return { type: 'customer', id: draft.customerId }
    if (draft.leadId) return { type: 'lead', id: draft.leadId }
    return null
  }, [draft])

  const itemsPreview = useMemo(
    () => quoteLinesToItems(draft.lines, catalogById),
    [draft.lines, catalogById],
  )
  const total = sumQuoteLines(itemsPreview)

  const hasLinkedParty = Boolean(draft.customerId || draft.leadId)

  const customerDefaults = useMemo(() => {
    if (selectedLead) return leadCustomerDefaults(selectedLead)
    if (selectedCustomer) {
      return {
        name: selectedCustomer.name,
        company: selectedCustomer.name,
        customerType: selectedCustomer.customerType || 'b2b',
        branchIds: selectedCustomer.branchIds?.length
          ? selectedCustomer.branchIds
          : [selectedCustomer.branchId].filter(Boolean),
      }
    }
    return null
  }, [selectedLead, selectedCustomer])

  const setLine = (index, patch) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }))
  }

  const addLine = () => {
    setDraft((current) => ({ ...current, lines: [...current.lines, emptyQuoteLine()] }))
  }

  const removeLine = (index) => {
    setDraft((current) => {
      const next = current.lines.filter((_, i) => i !== index)
      return { ...current, lines: next.length ? next : [emptyQuoteLine()] }
    })
  }

  const handleCustomerCreated = async (customer) => {
    setDraft((current) => ({
      ...current,
      customerId: customer.id,
      partyType: 'customer',
      branchId: current.branchId || customer.branchIds?.[0] || customer.branchId || '',
    }))
    toast.success('Cliente listo para cotizar')
  }

  const submit = async () => {
    if (!editable) {
      toast.error('Esta cotización no se puede editar en su estado actual')
      return
    }
    setSaving(true)
    try {
      let customer = customers.find((item) => item.id === draft.customerId)
      let leadId = draft.leadId || null
      let lead = leadId ? leads.find((item) => item.id === leadId) : null

      if (draft.partyType === 'lead' && draft.leadId) {
        lead = selectedLead || leads.find((item) => item.id === draft.leadId)
        const ensured = await ensureCustomerForLeadQuote({
          lead,
          addCustomer,
        })
        if (!ensured?.id) {
          toast.error('El lead necesita sucursal para cotizar')
          return
        }
        leadId = ensured.leadId || lead?.id || leadId
        customer = useCustomersStore.getState().customers.find((item) => item.id === ensured.id)
          || { id: ensured.id, name: lead?.company || lead?.name || '' }
        setDraft((current) => ({ ...current, customerId: ensured.id, leadId }))
      } else if (!customer) {
        const ensured = await ensureCustomerForQuote({
          customerId: draft.customerId || null,
          lead: selectedLead,
          addCustomer,
        })
        if (!ensured?.id) {
          toast.error('Selecciona un lead o cliente para continuar')
          return
        }
        customer = useCustomersStore.getState().customers.find((item) => item.id === ensured.id) || ensured
        setDraft((current) => ({ ...current, customerId: ensured.id }))
      }

      const branchId = draft.branchId || quoteBranches[0]?.id
      if (!branchId) {
        toast.error('Selecciona una sucursal')
        return
      }
      const items = quoteLinesToItems(draft.lines, catalogById)
      if (!items.length) {
        toast.error('Agrega al menos un producto o servicio')
        return
      }
      const duplicateIds = items.map((item) => item.itemId)
      if (duplicateIds.length !== new Set(duplicateIds).size) {
        toast.error('No repitas el mismo producto; ajusta la cantidad en una sola línea')
        return
      }
      for (const item of items) {
        if (!isProductAvailableAtBranch(catalogById.get(item.itemId), branchId)) {
          toast.error(`«${item.name}» no está disponible en la sucursal seleccionada`)
          return
        }
      }

      if (!leadId && draft.leadId) {
        leadId = draft.leadId
      }
      const payload = {
        customerId: customer.id,
        customerName: customer.name,
        leadId,
        branchId,
        items,
        total,
        validUntil: quote?.validUntil || new Date(Date.now() + 15 * 86400000).toISOString(),
      }
      let saved = null
      if (editing) {
        saved = await updateQuote(quote.id, payload)
        toast.success('Cotización actualizada')
      } else {
        saved = await addQuote(payload)
        if (leadId) {
          await syncLeadPipelineValue({ leadId, total, updateLead }).catch(() => {})
        }
        toast.success('Cotización creada y vinculada')
      }
      onSaved?.(saved)
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar la cotización')
    } finally {
      setSaving(false)
    }
  }

  const catalogEmpty = sellableCatalog.length === 0
  const catalogReady = !isOnline || catalogHydrated
  const catalogBlocked = isOnline && (!catalogReady || catalogLoading)

  return (
    <>
      <Modal
        open={open}
        onClose={() => { if (!saving) onClose() }}
        title={editing ? `Editar ${quote?.number || 'cotización'}` : 'Nueva cotización'}
        wide
        testId="quote-form-modal"
      >
        <div className="relative space-y-4">
          {catalogBlocked && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/80 backdrop-blur-[1px]"
              data-testid="quote-form-catalog-loading"
            >
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-slate-600">Cargando productos…</p>
            </div>
          )}
          {!hasLinkedParty && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-700">Elige un lead o cliente, o créalo aquí.</p>
              <Button type="button" size="sm" className="mt-2" onClick={() => setCustomerModalOpen(true)}>
                <UserPlus className="h-4 w-4" /> Nuevo cliente
              </Button>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Lead / Cliente</label>
            <QuotePartyPicker
              value={partyValue}
              branchId={selectedLead?.branchId || draft.branchId || null}
              pinnedLead={selectedLead}
              pinnedCustomer={selectedCustomer}
              disabled={!editable || catalogBlocked}
              onChange={(party) => {
                if (!party) return
                if (party.type === 'customer') {
                  const customer = customers.find((item) => item.id === party.id)
                  const ids = customer?.branchIds?.length
                    ? customer.branchIds
                    : customer?.branchId
                      ? [customer.branchId]
                      : []
                  setDraft((current) => ({
                    ...current,
                    partyType: 'customer',
                    customerId: party.id,
                    leadId: '',
                    branchId: ids.includes(current.branchId) ? current.branchId : ids[0] || current.branchId,
                  }))
                  return
                }
                const lead = leads.find((item) => item.id === party.id)
                setDraft((current) => ({
                  ...current,
                  partyType: 'lead',
                  leadId: party.id,
                  customerId: lead?.customerId || '',
                  branchId: lead?.branchId || current.branchId,
                }))
              }}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sucursal</label>
            <BranchMultiSelect
              branches={quoteBranches}
              branchIds={draft.branchId ? [draft.branchId] : []}
              onChange={(ids) => setDraft((current) => ({ ...current, branchId: ids[0] || '' }))}
              selectionMode="single"
              showAllOption={false}
              disabled={Boolean(selectedLead?.branchId) || !editable}
              className="w-full"
              testId="quote-form-branch"
            />
          </div>

          {catalogEmpty ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="flex items-center gap-2 font-medium text-slate-800">
                <Package className="h-4 w-4" /> No hay productos listos para cotizar
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isOnline
                  ? 'Activa productos vendibles en POS y sincronízalos con la API.'
                  : 'Agrega productos vendibles en inventario.'}
              </p>
              <Link
                to="/inventarios"
                className="mt-3 inline-flex text-sm font-semibold text-blue-600 hover:underline"
              >
                Ir a inventario
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ítems</p>
              <div className="space-y-2">
                {draft.lines.map((line, index) => {
                  const usedElsewhere = new Set(
                    draft.lines.map((row, i) => (i === index ? null : row.itemId)).filter(Boolean),
                  )
                  const options = [
                    { value: '', label: 'Producto o servicio…' },
                    ...sellableForBranch
                      .filter((product) => !usedElsewhere.has(product.id) || product.id === line.itemId)
                      .map((product) => ({ value: product.id, label: product.name })),
                  ]
                  return (
                    <div
                      key={index}
                      className="grid grid-cols-1 gap-2 rounded-xl border border-slate-100 p-3 sm:grid-cols-[1fr_72px_100px_36px]"
                    >
                      <Select
                        value={line.itemId}
                        onChange={(value) => {
                          const product = catalogById.get(value)
                          setLine(index, {
                            itemId: value,
                            price: product?.price != null ? String(product.price) : line.price,
                          })
                        }}
                        options={options}
                        disabled={!editable}
                      />
                      <Input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => setLine(index, { qty: e.target.value })}
                        disabled={!editable}
                        aria-label="Cantidad"
                      />
                      <Input
                        type="number"
                        value={line.price}
                        onChange={(e) => setLine(index, { price: e.target.value })}
                        disabled={!editable}
                        aria-label="Precio"
                      />
                      {editable && draft.lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          className="flex h-10 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                          aria-label="Quitar línea"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {editable && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={addLine}
                  data-testid="quote-add-line"
                >
                  <Plus className="h-4 w-4" /> Añadir producto
                </Button>
              )}
              <p className="text-right font-heading text-lg font-bold text-emerald-600">
                Subtotal {formatDOP(total)}<span className="block text-xs font-normal text-slate-500">Impuestos y descuentos se calculan al guardar.</span>
              </p>
            </div>
          )}

          {!editable && (
            <p className="text-sm text-amber-700">
              Solo se pueden editar cotizaciones en borrador o enviadas.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button
              onClick={submit}
              disabled={saving || catalogEmpty || catalogBlocked || !editable || !hasLinkedParty}
              data-testid="quote-form-save"
            >
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cotización'}
            </Button>
          </div>
        </div>
      </Modal>

      <CustomerFormModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        defaults={customerDefaults}
        onCreated={handleCustomerCreated}
      />
    </>
  )
}
