import { useEffect, useMemo, useState } from 'react'

import { Link } from 'react-router-dom'

import { toast } from 'sonner'
import {
  Building2,
  Download,
  FileText,
  Link2,
  Plus,
  Printer,
  Receipt,
  UserCheck,
  UserPlus,
  Package,
} from 'lucide-react'

import { Modal } from '@/components/ui/Modal'

import { Button } from '@/components/ui/Button'

import { Select } from '@/components/ui/Select'

import { Input } from '@/components/ui/Input'

import { formatDOP } from '@/lib/format'

import {

  effectiveOpportunityCustomerId,

  opportunityCompanyLabel,

  resolveCustomerForOpportunity,

} from '../lib/opportunityCustomer'

import {
  findBillableQuote,
  previewInvoiceNumber,
  sumQuoteLines,
  validatePipelineClose,
} from '../lib/pipelineInvoice'
import { downloadQuotePdf, printQuoteDocument } from '../lib/sales'



const PAYMENT_OPTIONS = [

  { value: 'efectivo', label: 'Efectivo' },

  { value: 'tarjeta', label: 'Tarjeta' },

  { value: 'transferencia', label: 'Transferencia' },

]



export function CloseOpportunityInvoiceModal({

  open,

  onClose,

  opportunity,

  quotes,

  branches,

  customers = [],

  linkableCustomers = [],

  products = [],

  paymentMethod,

  onPaymentMethodChange,

  onCreateQuote,

  onLinkQuote,

  onConfirm,

  onCreateCustomer,

  onLinkCustomer,

  onConvertLead,

  onOpenQuoteBuilder,

  documentCtx = null,

  loading = false,

  quoteBusy = false,

  convertLeadBusy = false,

}) {

  const [linkQuoteId, setLinkQuoteId] = useState('')

  const [linkCustomerId, setLinkCustomerId] = useState('')

  const [draftItemId, setDraftItemId] = useState('')

  const [draftPrice, setDraftPrice] = useState('')



  const resolvedCustomer = useMemo(

    () => (opportunity ? resolveCustomerForOpportunity(opportunity, customers) : null),

    [opportunity, customers],

  )

  const companyLabel = opportunity ? opportunityCompanyLabel(opportunity) : ''

  const effectiveCustomerId = opportunity ? effectiveOpportunityCustomerId(opportunity, customers) : null



  const quote = useMemo(

    () => (opportunity ? findBillableQuote(quotes, opportunity.id) : null),

    [opportunity, quotes],

  )



  useEffect(() => {

    if (!open) return

    setLinkQuoteId('')

    setLinkCustomerId('')

    setDraftItemId('')

    setDraftPrice('')

  }, [open, opportunity?.id])



  const branch = branches.find((item) => item.id === opportunity?.branchId)

  const opportunityForValidation = opportunity

    ? { ...opportunity, customerId: effectiveCustomerId || null }

    : null

  const validationError = opportunityForValidation

    ? validatePipelineClose({ opportunity: opportunityForValidation, quotes })

    : null

  const missingCustomer = !effectiveCustomerId

  const missingQuote = !quote

  const showValidationError = Boolean(validationError)

    && !((missingQuote && /cotización/i.test(validationError))

      || (missingCustomer && /cliente/i.test(validationError)))



  const invoicePreview = previewInvoiceNumber()

  const total = quote?.total || sumQuoteLines(quote?.items)



  const linkableQuotes = useMemo(() => {

    if (!opportunity) return []

    return quotes.filter((row) => {

      if (!row.items?.length) return false

      if (['rechazada', 'vencida'].includes(row.status)) return false

      if (row.opportunityId && row.opportunityId !== opportunity.id) return false

      if (row.branchId && opportunity.branchId && row.branchId !== opportunity.branchId) return false

      if (effectiveCustomerId && row.customerId && row.customerId !== effectiveCustomerId) return false

      return true

    })

  }, [quotes, opportunity, effectiveCustomerId])



  const productOptions = useMemo(() => [

    { value: '', label: 'Producto o servicio…' },

    ...products.map((product) => ({ value: product.id, label: product.name })),

  ], [products])



  const selectedProduct = products.find((item) => item.id === draftItemId)

  const catalogEmpty = products.length === 0



  useEffect(() => {

    if (!selectedProduct || draftPrice) return

    setDraftPrice(String(selectedProduct.price ?? ''))

  }, [selectedProduct, draftPrice])



  const buildQuotePayload = () => {

    if (!opportunity) return null

    const product = products.find((item) => item.id === draftItemId)

    if (!product) return null

    const price = Number(draftPrice) || Number(product.price) || 0

    const customer = effectiveCustomerId
      ? (customers.find((item) => item.id === effectiveCustomerId) || resolvedCustomer)
      : null

    return {

      customerId: effectiveCustomerId || null,

      customerName: customer?.name || companyLabel,

      opportunityId: opportunity.id,

      branchId: opportunity.branchId,

      items: [{

        id: product.id,

        itemId: product.id,

        name: product.name,

        qty: 1,

        price,

      }],

      total: price,

      validUntil: new Date(Date.now() + 15 * 86400000).toISOString(),

    }

  }



  const handleCreateQuote = async (accept = false) => {

    const payload = buildQuotePayload()

    if (!payload) return

    await onCreateQuote({ ...payload, status: accept ? 'aceptada' : 'borrador' })

    if (accept) {

      await onConfirm({ customerId: effectiveCustomerId })

    }

  }



  const handleLinkQuote = async () => {

    if (!linkQuoteId || !opportunity) return

    await onLinkQuote(linkQuoteId, opportunity.id)

  }



  const handleLinkCustomer = async () => {

    if (!linkCustomerId) return

    await onLinkCustomer(linkCustomerId)

    setLinkCustomerId('')

  }



  const handleConfirm = () => {

    if (!effectiveCustomerId) return

    onConfirm({ customerId: effectiveCustomerId })

  }

  const canExportQuote = Boolean(quote && documentCtx)

  const handlePrintQuote = () => {
    if (!quote || !documentCtx) return
    printQuoteDocument(quote, documentCtx)
    toast.success('Enviando cotización a impresión…')
  }

  const handleDownloadQuote = async () => {
    if (!quote || !documentCtx) return
    try {
      await downloadQuotePdf(quote, documentCtx)
      toast.success('Cotización descargada')
    } catch (error) {
      toast.error(error.message || 'No se pudo descargar la cotización')
    }
  }

  const customerBusy = quoteBusy || convertLeadBusy || loading



  return (

    <Modal
      open={open}
      onClose={() => { if (!loading && !quoteBusy) onClose() }}
      title="Cerrar oportunidad y facturar"
      testId="pipeline-close-invoice-modal"
      wide
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >

      {opportunity && (
        <>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">

            <p className="text-sm text-emerald-800">

              Se generará la factura{' '}
              <span className="font-semibold">{invoicePreview}</span>
              {branch ? ` de ${branch.name}` : ''}.

            </p>

            <p className="mt-1 text-xs text-emerald-700">

              La oportunidad quedará en{' '}
              <strong>Cerrado</strong>
              {' '}y la venta aparecerá en CRM → Ventas.

            </p>

          </div>



          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">

            <div className="flex items-start gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">

                <Receipt className="h-5 w-5" />

              </div>

              <div className="min-w-0 flex-1">

                <p className="font-semibold text-slate-900">{opportunity.title}</p>

                <p className="text-sm text-slate-500">{companyLabel}</p>

              </div>

              <p className="font-heading text-lg font-bold text-emerald-600">{formatDOP(total)}</p>

            </div>

          </div>



          <div className="rounded-xl border border-slate-100 bg-white p-3">

            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">

              <Building2 className="h-3.5 w-3.5" /> Cliente para facturar

            </p>

            {!missingCustomer && (

              <>

                <p className="font-medium text-slate-900">{resolvedCustomer?.name || companyLabel}</p>

                {resolvedCustomer && (

                  <p className="mt-1 text-xs text-slate-500">

                    Ficha vinculada · listo para facturar

                  </p>

                )}

              </>

            )}

            {missingCustomer && (

              <div className="mt-2 space-y-3">

                <p className="text-sm text-amber-800">
                  Vincula o crea el cliente para facturar. También puedes cotizar con «{companyLabel}» y crear la ficha al guardar.
                </p>

                {opportunity.leadId && onConvertLead && (

                  <Button

                    type="button"

                    size="sm"

                    variant="secondary"

                    onClick={onConvertLead}

                    disabled={customerBusy}

                    data-testid="pipeline-close-convert-lead"

                  >

                    <UserCheck className="h-3.5 w-3.5" />

                    {convertLeadBusy ? 'Convirtiendo…' : 'Convertir lead a cliente B2B'}

                  </Button>

                )}

                {linkableCustomers.length > 0 && (

                  <div className="flex flex-col gap-2 sm:flex-row">

                    <Select

                      className="min-w-0 flex-1"

                      value={linkCustomerId}

                      onChange={setLinkCustomerId}

                      options={[

                        { value: '', label: 'Elegir cliente existente…' },

                        ...linkableCustomers.map((row) => ({ value: row.id, label: row.name })),

                      ]}

                      data-testid="pipeline-close-link-customer"

                    />

                    <Button

                      type="button"

                      variant="secondary"

                      onClick={handleLinkCustomer}

                      disabled={!linkCustomerId || customerBusy}

                    >

                      Vincular

                    </Button>

                  </div>

                )}

                {onCreateCustomer && (

                  <Button

                    type="button"

                    size="sm"

                    variant="secondary"

                    onClick={onCreateCustomer}

                    disabled={customerBusy}

                    data-testid="pipeline-close-create-customer"

                  >

                    <UserPlus className="h-3.5 w-3.5" /> Crear cliente

                  </Button>

                )}

              </div>

            )}

          </div>



          {quote ? (

            <div className="space-y-2">

              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">

                <FileText className="h-3.5 w-3.5" /> Cotización {quote.number}

              </p>

              <div className="space-y-2 rounded-xl border border-slate-100 p-3">

                {quote.items.map((item, index) => (

                  <div key={`${item.name}-${index}`} className="flex items-center justify-between text-sm">

                    <span className="text-slate-700">{item.qty || 1} × {item.name}</span>

                    <span className="font-medium text-slate-900">{formatDOP((item.qty || 1) * (item.price || 0))}</span>

                  </div>

                ))}

              </div>

              {canExportQuote && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handlePrintQuote}
                    data-testid="pipeline-close-print-quote"
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir cotización
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleDownloadQuote}
                    data-testid="pipeline-close-download-quote"
                  >
                    <Download className="h-3.5 w-3.5" /> Descargar PDF
                  </Button>
                </div>
              )}

            </div>

          ) : (

            <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">

              <div className="flex flex-wrap items-center justify-between gap-2">

                <p className="text-sm font-semibold text-slate-800">Cotización para facturar</p>

                {onOpenQuoteBuilder && (

                  <Button

                    type="button"

                    size="sm"

                    variant="secondary"

                    onClick={onOpenQuoteBuilder}

                    disabled={customerBusy}

                    data-testid="pipeline-close-full-quote"

                  >

                    <FileText className="h-3.5 w-3.5" /> Cotización completa

                  </Button>

                )}

              </div>



              {linkableQuotes.length > 0 && (

                <div className="space-y-2">

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">

                    <Link2 className="h-3.5 w-3.5" /> Vincular cotización existente

                  </label>

                  <div className="flex gap-2">

                    <Select

                      className="min-w-0 flex-1"

                      value={linkQuoteId}

                      onChange={setLinkQuoteId}

                      options={[

                        { value: '', label: 'Elegir cotización…' },

                        ...linkableQuotes.map((row) => ({

                          value: row.id,

                          label: `${row.number} · ${formatDOP(row.total)}`,

                        })),

                      ]}

                      data-testid="pipeline-close-link-quote"

                    />

                    <Button

                      type="button"

                      variant="secondary"

                      onClick={handleLinkQuote}

                      disabled={!linkQuoteId || quoteBusy}

                    >

                      Vincular

                    </Button>

                  </div>

                </div>

              )}



              <div className="space-y-2 border-t border-slate-200/80 pt-3">

                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">

                  <Plus className="h-3.5 w-3.5" /> Cotización rápida (un ítem)

                </label>

                {catalogEmpty ? (

                  <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">

                    <Package className="mt-0.5 h-4 w-4 shrink-0" />

                    <p>

                      No hay productos vendibles en esta sucursal. Sincroniza el catálogo o usa{' '}

                      <strong>Cotización completa</strong>.

                      <Link to="/inventarios" className="ml-1 font-semibold text-amber-800 underline">

                        Ir a inventarios

                      </Link>

                    </p>

                  </div>

                ) : (

                  <>

                    <Select

                      value={draftItemId}

                      onChange={setDraftItemId}

                      options={productOptions}

                      data-testid="pipeline-close-quote-product"

                    />

                    <Input

                      type="number"

                      min="0"

                      placeholder="Precio (DOP)"

                      value={draftPrice}

                      onChange={(event) => setDraftPrice(event.target.value)}

                      data-testid="pipeline-close-quote-price"

                    />

                    <div className="flex flex-wrap gap-2">

                      <Button

                        type="button"

                        variant="secondary"

                        size="sm"

                        onClick={() => handleCreateQuote(false)}

                        disabled={quoteBusy || !draftItemId}

                        data-testid="pipeline-close-create-quote"

                      >

                        {quoteBusy ? 'Guardando…' : 'Crear cotización'}

                      </Button>

                      <Button

                        type="button"

                        size="sm"

                        onClick={() => handleCreateQuote(true)}

                        disabled={quoteBusy || loading || !draftItemId}

                        data-testid="pipeline-close-create-and-invoice"

                      >

                        Crear, aceptar y facturar

                      </Button>

                    </div>

                  </>

                )}

              </div>

            </div>

          )}

        </div>

        <div className="shrink-0 space-y-3 border-t border-slate-100 bg-white p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Método de pago</label>
            <Select
              value={paymentMethod}
              onChange={onPaymentMethodChange}
              options={PAYMENT_OPTIONS}
              data-testid="pipeline-close-payment-method"
            />
          </div>

          {showValidationError && validationError && (
            <p className="text-sm text-red-600" data-testid="pipeline-close-validation">
              {validationError}
            </p>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading || quoteBusy}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleConfirm}
              disabled={loading || quoteBusy || missingCustomer || missingQuote}
              data-testid="pipeline-close-confirm"
            >
              {loading ? 'Facturando…' : 'Generar factura'}
            </Button>
          </div>
        </div>
        </>
      )}

    </Modal>

  )

}


