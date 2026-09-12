import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, UserCheck, UserPlus, Package } from 'lucide-react'
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
  draftFromOpportunity,
  draftFromQuote,
  emptyQuoteDraft,
  emptyQuoteLine,
  isQuoteEditable,
  quoteLinesToItems,
} from '../lib/quoteForm'
import { CustomerFormModal } from './CustomerFormModal'
import { opportunityCompanyLabel } from '../lib/opportunityCustomer'
import { ensureCustomerForQuote } from '../lib/quoteCustomer'

function belongsToBranch(customer, branchId) {
  if (!branchId) return true
  const branchIds = customer.branchIds?.length ? customer.branchIds : [customer.branchId].filter(Boolean)
  return branchIds.includes(branchId)
}

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
  const isOnline = useSessionStore((s) => s.status === 'online')
  const opportunities = useCrmStore((s) => s.opportunities)
  const convertToCustomer = useCrmStore((s) => s.convertToCustomer)
  const updateOpportunity = useCrmStore((s) => s.updateOpportunity)
  const addQuote = useCrmStore((s) => s.addQuote)
  const updateQuote = useCrmStore((s) => s.updateQuote)

  const [draft, setDraft] = useState(emptyQuoteDraft)
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [customerModalOpen, setCustomerModalOpen] = useState(false)

  const editing = Boolean(quote)
  const editable = isQuoteEditable(quote)

  useEffect(() => {
    if (!open) return
    if (quote) {
      setDraft(draftFromQuote(quote))
      return
    }
    if (initialContext?.opportunityId) {
      const opportunity = opportunities.find((item) => item.id === initialContext.opportunityId)
      if (opportunity) {
        setDraft(draftFromOpportunity(opportunity))
        return
      }
    }
    setDraft({
      ...emptyQuoteDraft(),
      customerId: initialContext?.customerId || '',
      opportunityId: initialContext?.opportunityId || '',
      branchId: initialContext?.branchId || '',
    })
  }, [open, quote, initialContext, opportunities])

  const selectedOpportunity = useMemo(
    () => opportunities.find((item) => item.id === draft.opportunityId),
    [opportunities, draft.opportunityId],
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
    if (selectedOpportunity?.branchId) return [selectedOpportunity.branchId]
    return null
  }, [selectedCustomer, selectedOpportunity])

  const quoteBranches = useMemo(() => {
    const active = branches.filter((branch) => branch.active)
    if (selectedOpportunity?.branchId) {
      return active.filter((branch) => branch.id === selectedOpportunity.branchId)
    }
    if (customerBranchIds?.length) {
      return active.filter((branch) => customerBranchIds.includes(branch.id))
    }
    return active
  }, [branches, customerBranchIds, selectedOpportunity])

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

  const customerOptions = useMemo(() => [
    { value: '', label: 'Seleccionar cliente' },
    ...customers
      .filter((customer) => {
        if (customer.isDefault) return false
        const branchId = selectedOpportunity?.branchId || draft.branchId
        return !branchId || belongsToBranch(customer, branchId)
      })
      .map((customer) => ({ value: customer.id, label: customer.name })),
  ], [customers, selectedOpportunity, draft.branchId])

  const oppOptions = useMemo(() => [
    { value: '', label: 'Sin oportunidad' },
    ...opportunities.map((opportunity) => ({
      value: opportunity.id,
      label: opportunity.title,
    })),
  ], [opportunities])

  const itemsPreview = useMemo(
    () => quoteLinesToItems(draft.lines, catalogById),
    [draft.lines, catalogById],
  )
  const total = sumQuoteLines(itemsPreview)

  const hasLinkedCustomer = Boolean(draft.customerId)
  const opportunityLabel = selectedOpportunity ? opportunityCompanyLabel(selectedOpportunity) : ''
  const canQuoteWithoutLinkedCustomer = Boolean(selectedOpportunity && opportunityLabel)

  const customerDefaults = useMemo(() => {
    if (!selectedOpportunity) return null
    const name = selectedOpportunity.customerName || selectedOpportunity.title || ''
    const branchIds = selectedOpportunity.branchId ? [selectedOpportunity.branchId] : []
    return {
      name,
      company: name,
      customerType: 'b2b',
      branchIds,
    }
  }, [selectedOpportunity])

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

  const linkCustomerToOpportunity = async (customer) => {
    if (!selectedOpportunity || !customer?.id) return
    setDraft((current) => ({
      ...current,
      customerId: customer.id,
      branchId: current.branchId || selectedOpportunity.branchId || customer.branchIds?.[0] || customer.branchId || '',
    }))
    if (!selectedOpportunity.customerId) {
      await updateOpportunity(selectedOpportunity.id, {
        customerId: customer.id,
        customerName: customer.name,
      })
    }
  }

  const handleCustomerCreated = async (customer) => {
    await linkCustomerToOpportunity(customer)
    toast.success('Cliente listo para cotizar')
  }

  const handleConvertLead = async () => {
    if (!selectedOpportunity?.leadId) return
    setConverting(true)
    try {
      const customer = await convertToCustomer(selectedOpportunity.leadId)
      if (customer?.id) {
        await linkCustomerToOpportunity(customer)
        toast.success('Lead convertido; ya puedes armar la cotización')
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo convertir el lead')
    } finally {
      setConverting(false)
    }
  }

  const submit = async () => {
    if (!editable) {
      toast.error('Esta cotización no se puede editar en su estado actual')
      return
    }
    let customer = customers.find((item) => item.id === draft.customerId)
    if (!customer) {
      const ensured = await ensureCustomerForQuote({
        customerId: draft.customerId || null,
        opportunity: selectedOpportunity,
        addCustomer,
        updateOpportunity,
      })
      if (!ensured?.id) {
        toast.error('Selecciona o crea un cliente para continuar')
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

    setSaving(true)
    try {
      const payload = {
        customerId: customer.id,
        customerName: customer.name,
        opportunityId: draft.opportunityId || null,
        branchId,
        items,
        total,
        validUntil: quote?.validUntil || new Date(Date.now() + 15 * 86400000).toISOString(),
      }
      if (editing) {
        await updateQuote(quote.id, payload)
        toast.success('Cotización actualizada')
      } else {
        await addQuote(payload)
        toast.success('Cotización creada y vinculada')
      }
      onSaved?.()
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar la cotización')
    } finally {
      setSaving(false)
    }
  }

  const catalogEmpty = sellableCatalog.length === 0

  return (
    <>
      <Modal
        open={open}
        onClose={() => { if (!saving) onClose() }}
        title={editing ? `Editar ${quote?.number || 'cotización'}` : 'Nueva cotización'}
        wide
        testId="quote-form-modal"
      >
        <div className="space-y-4">
          {!hasLinkedCustomer && selectedOpportunity && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" data-testid="quote-customer-gate">
              <p className="text-sm text-slate-700">
                Puedes armar la cotización sin ficha CRM. Al guardar, usamos «{opportunityLabel}» como cliente
                {canQuoteWithoutLinkedCustomer ? ' (o créalo antes si prefieres).' : '.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedOpportunity.leadId && (
                  <Button type="button" size="sm" variant="secondary" onClick={handleConvertLead} disabled={converting}>
                    <UserCheck className="h-4 w-4" />
                    {converting ? 'Convirtiendo…' : 'Convertir lead a B2B'}
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => setCustomerModalOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Crear cliente
                </Button>
              </div>
            </div>
          )}

          {!hasLinkedCustomer && !selectedOpportunity && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-700">Elige un cliente existente o créalo aquí.</p>
              <Button type="button" size="sm" className="mt-2" onClick={() => setCustomerModalOpen(true)}>
                <UserPlus className="h-4 w-4" /> Nuevo cliente
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Cliente</label>
              <Select
                value={draft.customerId}
                onChange={(value) => {
                  const customer = customers.find((item) => item.id === value)
                  const ids = customer?.branchIds?.length
                    ? customer.branchIds
                    : customer?.branchId
                      ? [customer.branchId]
                      : []
                  setDraft((current) => ({
                    ...current,
                    customerId: value,
                    branchId: ids.includes(current.branchId) ? current.branchId : ids[0] || current.branchId,
                  }))
                }}
                options={customerOptions}
                disabled={Boolean(selectedOpportunity?.customerId) || !editable}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Oportunidad</label>
              <Select
                value={draft.opportunityId}
                onChange={(value) => {
                  const opportunity = opportunities.find((item) => item.id === value)
                  setDraft((current) => ({
                    ...current,
                    opportunityId: value,
                    customerId: opportunity?.customerId || current.customerId,
                    branchId: opportunity?.branchId || current.branchId,
                  }))
                }}
                options={oppOptions}
                disabled={Boolean(initialContext?.opportunityId) || !editable}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sucursal</label>
            <BranchMultiSelect
              branches={quoteBranches}
              branchIds={draft.branchId ? [draft.branchId] : []}
              onChange={(ids) => setDraft((current) => ({ ...current, branchId: ids[0] || '' }))}
              selectionMode="single"
              showAllOption={false}
              disabled={Boolean(selectedOpportunity?.branchId) || !editable}
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
                Total {formatDOP(total)}
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
              disabled={saving || catalogEmpty || !editable || (!hasLinkedCustomer && !canQuoteWithoutLinkedCustomer && !selectedOpportunity)}
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
