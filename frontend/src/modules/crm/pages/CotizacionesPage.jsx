import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, Printer, Download, Pencil, Receipt, DollarSign } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { CRM_BRANCH_FILTER_CLASS, matchesBranches } from '@/lib/branches'
import { QUOTE_STATUSES, QUOTE_STATUS_META } from '@/data/crm'
import { fmtDate } from '../lib/crm'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { ExportMenu } from '@/modules/finanzas/components/ExportMenu'
import { downloadQuotePdf, printQuoteDocument, printSaleInvoice } from '../lib/sales'
import { QuoteFormModal } from '../components/QuoteFormModal'
import { QuoteInvoiceModal } from '../components/QuoteInvoiceModal'
import { isQuoteEditable } from '../lib/quoteForm'
import {
  canEmitQuoteInvoice,
  isQuoteInvoiced,
  isQuoteInvoicePaid,
  isQuoteInvoicePending,
  isQuoteInvoicePendingValidation,
  findQuoteReceivable,
  isSyntheticCrmReceivable,
  collectRowForQuote,
  quoteConvertedSaleId,
  resolveQuoteBilling,
  QUOTE_INVOICE_PERMISSION,
} from '../lib/quoteInvoice'
import { QuotePaymentDetailModal } from '../components/QuotePaymentDetailModal'
import { PermissionElevationModal } from '@/components/auth/PermissionElevationModal'
import { ReceivablePaymentModal } from '@/modules/pos/components/ReceivablePaymentModal'
import { ReceivableProofModal } from '@/modules/pos/components/ReceivableProofModal'
import { ReceivableCollectMenu } from '@/modules/pos/components/ReceivableCollectMenu'
import { mapReceivableFromApi, mapReceivablesPageFromApi } from '@/services/adapters/pos'
import { posApi } from '@/services/posApi'
import { getBalance, receivableHasPaymentEvidence } from '@/modules/pos/lib/receivables'
import { syncWorkspacePaymentMethods } from '@/lib/paymentMethodsSync'

export default function CotizacionesPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const quotes = useCrmStore((s) => s.quotes)
  const sales = useCrmStore((s) => s.sales)
  const branches = useConfigStore((s) => s.branches)
  const settings = useConfigStore((s) => s.settings)
  const paymentMethods = useConfigStore((s) => s.paymentMethods)
  const customers = useCustomersStore((s) => s.customers)
  const opportunities = useCrmStore((s) => s.opportunities)
  const updateQuote = useCrmStore((s) => s.updateQuote)
  const deleteQuote = useCrmStore((s) => s.deleteQuote)
  const invoiceQuote = useCrmStore((s) => s.invoiceQuote)
  const hydrateQuotesSection = useCrmStore((s) => s.hydrateSection)
  const ensureSaleDetail = useCrmStore((s) => s.ensureSaleDetail)
  const receivables = usePosStore((s) => s.receivables)
  const hydrateCxcWorkspace = usePosStore((s) => s.hydrateCxcWorkspace)
  const ensureReceivableDetail = usePosStore((s) => s.ensureReceivableDetail)
  const markReceivablePaid = usePosStore((s) => s.markReceivablePaid)
  const attachReceivableProof = usePosStore((s) => s.attachReceivableProof)
  const isOnline = useSessionStore((state) => state.isOnline())
  const canInvoice = useSessionStore((state) => state.hasPermission(QUOTE_INVOICE_PERMISSION))
  const canCollectReceivables = useSessionStore((state) => state.hasPermission('pos.receivables.collect'))

  const [formOpen, setFormOpen] = useState(false)
  const [editingQuote, setEditingQuote] = useState(null)
  const [initialContext, setInitialContext] = useState(null)
  const [branchIds, setBranchIds] = useState([])
  const [invoiceQuoteRow, setInvoiceQuoteRow] = useState(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [elevationOpen, setElevationOpen] = useState(false)
  const [collectPaymentRow, setCollectPaymentRow] = useState(null)
  const [collectProofRow, setCollectProofRow] = useState(null)
  const [paymentDetailQuote, setPaymentDetailQuote] = useState(null)

  const requestedOpportunityId = searchParams.get('opportunityId') || ''
  const requestedCustomerId = searchParams.get('customerId') || ''

  useEffect(() => {
    if (searchParams.get('tab')) {
      const next = new URLSearchParams(searchParams)
      next.delete('tab')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!quotes.some(isQuoteInvoiced)) return
    const load = async () => {
      try {
        await Promise.all([
          hydrateQuotesSection('quotes'),
          useCrmStore.getState().hydrateSection('sales'),
        ])
        await hydrateCxcWorkspace({ force: true })
      } catch {
        /* list still works with cached data */
      }
    }
    load()
  }, [quotes.length, hydrateCxcWorkspace, hydrateQuotesSection])

  useEffect(() => {
    if (!requestedOpportunityId) return
    const opportunity = opportunities.find((item) => item.id === requestedOpportunityId)
    if (!opportunity) return
    setEditingQuote(null)
    setInitialContext({
      opportunityId: opportunity.id,
      customerId: opportunity.customerId || '',
      branchId: opportunity.branchId || '',
    })
    setFormOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('opportunityId')
    setSearchParams(nextParams, { replace: true })
  }, [opportunities, requestedOpportunityId, searchParams, setSearchParams])

  useEffect(() => {
    if (requestedOpportunityId || !requestedCustomerId) return
    const customer = customers.find((item) => item.id === requestedCustomerId)
    if (!customer) return
    setEditingQuote(null)
    setInitialContext({
      customerId: customer.id,
      opportunityId: '',
      branchId: customer.branchIds?.[0] || customer.branchId || '',
    })
    setFormOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('customerId')
    setSearchParams(nextParams, { replace: true })
  }, [customers, requestedCustomerId, requestedOpportunityId, searchParams, setSearchParams])

  const enrichedQuotes = useMemo(
    () => quotes.map((quote) => resolveQuoteBilling(quote, receivables, sales)),
    [quotes, receivables, sales]
  )

  const visibleQuotes = useMemo(() => {
    return enrichedQuotes.filter((q) => matchesBranches(q, branchIds, (row) => (row.branchId ? [row.branchId] : [])))
  }, [enrichedQuotes, branchIds])

  const stats = useMemo(() => ({
    total: visibleQuotes.length,
    enviadas: visibleQuotes.filter((q) => q.status === 'enviada').length,
    aceptadas: visibleQuotes.filter((q) => q.status === 'aceptada').length,
    porCobrar: visibleQuotes.filter((q) => isQuoteInvoicePending(q, receivables)).length,
    valor: visibleQuotes.reduce((a, q) => a + (q.total || 0), 0),
  }), [visibleQuotes, receivables])

  const exportRows = useMemo(
    () => visibleQuotes.map((q) => ({
      numero: q.number,
      cliente: q.customerName,
      estado: QUOTE_STATUS_META[q.status]?.label || q.status,
      factura: q.invoiceNumber || '',
      total: formatDOP(q.total),
      fecha: fmtDate(q.createdAt),
    })),
    [visibleQuotes]
  )

  const documentCtx = useMemo(
    () => ({ branches, settings, customers }),
    [branches, settings, customers]
  )

  const openCreate = () => {
    setEditingQuote(null)
    setInitialContext(null)
    setFormOpen(true)
  }

  const openEdit = (quote) => {
    if (!isQuoteEditable(quote)) {
      toast.error('Esta cotización no se puede editar')
      return
    }
    setEditingQuote(quote)
    setInitialContext(null)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingQuote(null)
    setInitialContext(null)
  }

  const changeStatus = async (quoteId, status) => {
    try {
      await updateQuote(quoteId, { status })
    } catch (error) {
      toast.error(error.message || 'No se pudo cambiar el estado')
    }
  }

  const cancelQuote = async (quoteId) => {
    try {
      await deleteQuote(quoteId)
      toast.success('Cotización cancelada')
    } catch (error) {
      toast.error(error.message || 'No se pudo cancelar la cotización')
    }
  }

  const printQuote = (quote) => {
    printQuoteDocument(quote, documentCtx)
    toast.success('Enviando cotización a impresión…')
  }

  const downloadQuote = (quote) => {
    downloadQuotePdf(quote, documentCtx)
    toast.success('Cotización descargada')
  }

  const openInvoice = (quote) => {
    if (!canInvoice) {
      setElevationOpen(true)
      return
    }
    setInvoiceQuoteRow(quote)
    if (isOnline) {
      syncWorkspacePaymentMethods().catch(() => {})
    }
  }

  const syncPaymentMethodsForInvoice = () => syncWorkspacePaymentMethods()

  const confirmInvoice = async (payload) => {
    const { collectionMode, paymentMethod, paymentMethodId, reference, proof } = payload || {}
    if (!invoiceQuoteRow) return
    setInvoiceLoading(true)
    try {
      const result = await invoiceQuote(invoiceQuoteRow.id, {
        collectionMode,
        paymentMethod: paymentMethod || paymentMethodId,
        reference,
        proof,
      })
      const status = result.quote?.invoiceCollection
      toast.success(
        status === 'pending_validation'
          ? `Factura ${result.sale.number} emitida · pendiente de validación`
          : status === 'receivable'
            ? `Factura ${result.sale.number} emitida · queda por cobrar`
            : `Factura ${result.sale.number} emitida y cobrada`
      )
      setInvoiceQuoteRow(null)
    } catch (error) {
      toast.error(error.message || 'No se pudo emitir la factura')
    } finally {
      setInvoiceLoading(false)
    }
  }

  const linkedQuoteForReceivable = (row) => {
    if (row?.quoteId) {
      return enrichedQuotes.find((quote) => quote.id === row.quoteId) || null
    }
    const saleId = row?.saleId
    return enrichedQuotes.find(
      (quote) => saleId && String(quoteConvertedSaleId(quote, sales)) === String(saleId)
    ) || null
  }

  const resolveReceivableForCollect = async (row) => {
    if (!isSyntheticCrmReceivable(row) && row?.id) {
      const detail = await ensureReceivableDetail(row.id) || row
      return detail
    }
    const quote = row?.quoteId
      ? enrichedQuotes.find((item) => item.id === row.quoteId) || null
      : linkedQuoteForReceivable(row)
    await Promise.all([
      hydrateQuotesSection('quotes').catch(() => {}),
      useCrmStore.getState().hydrateSection('sales').catch(() => {}),
      hydrateCxcWorkspace({ force: true }),
    ])
    const latestSales = useCrmStore.getState().sales
    const storeReceivables = usePosStore.getState().receivables
    const saleId = quoteConvertedSaleId(quote || {}, latestSales) || row?.saleId
    const receivableId = quote?.receivableId || (row?.id && !isSyntheticCrmReceivable(row) ? row.id : null)
    let found = receivableId
      ? storeReceivables.find((item) => item.id === receivableId)
      : null
    if (!found && quote) {
      found = findQuoteReceivable(quote, storeReceivables, latestSales)
    }
    if (!found && saleId) {
      found = storeReceivables.find((item) => String(item.saleId) === String(saleId))
    }
    if (!found) {
      const allItems = []
      let page = 1
      let totalPages = 1
      while (page <= totalPages) {
        const list = await posApi.listReceivables({ page, pageSize: 100 })
        const mapped = mapReceivablesPageFromApi(list || { items: [] })
        allItems.push(...mapped.items)
        totalPages = mapped.pagination?.totalPages || 1
        page += 1
      }
      found = (receivableId && allItems.find((item) => item.id === receivableId))
        || (saleId && allItems.find((item) => String(item.saleId) === String(saleId)))
        || null
      if (found) {
        usePosStore.setState((state) => ({
          receivables: [found, ...state.receivables.filter((item) => item.id !== found.id)],
        }))
      }
    }
    if (!found?.id && saleId && isOnline) {
      try {
        const response = await posApi.getReceivableForSale(saleId)
        found = mapReceivableFromApi(response)
        if (found?.id) {
          usePosStore.setState((state) => ({
            receivables: [found, ...state.receivables.filter((item) => item.id !== found.id)],
          }))
        }
      } catch {
        /* sale may not have a receivable */
      }
    }
    if (!found?.id) return null
    return await ensureReceivableDetail(found.id) || found
  }

  const refreshAfterCollect = async () => {
    await Promise.all([
      hydrateQuotesSection('quotes'),
      useCrmStore.getState().hydrateSection('sales'),
      hydrateCxcWorkspace({ force: true }),
    ])
  }

  const handleConfirmReceivable = async (row, payload = {}) => {
    if (!canCollectReceivables) {
      toast.error('No tienes permiso para registrar cobros.')
      return false
    }
    const receivable = await resolveReceivableForCollect(row)
    if (!receivable) {
      toast.error('No se encontró la cuenta por cobrar. Actualiza la página e inténtalo de nuevo.')
      return false
    }
    if (isOnline && !receivableHasPaymentEvidence(receivable, payload)) {
      setCollectProofRow(receivable)
      toast.info('Ingresa el N° de referencia o sube el comprobante.')
      return false
    }
    try {
      const method = isOnline && ['transferencia', 'link', 'tarjeta'].includes(receivable.method)
        ? receivable.method
        : 'transferencia'
      await markReceivablePaid(receivable.id, method, payload)
      toast.success(`Pago confirmado · ${formatDOP(getBalance(receivable))}`)
      await refreshAfterCollect()
      return true
    } catch (error) {
      toast.error(error.message || 'No se pudo confirmar el pago.')
      return false
    }
  }

  const handleCashReceivable = async (row, payload = {}) => {
    if (!canCollectReceivables) {
      toast.error('No tienes permiso para registrar cobros.')
      return false
    }
    const receivable = await resolveReceivableForCollect(row)
    if (!receivable) {
      toast.error('No se encontró la cuenta por cobrar.')
      return false
    }
    try {
      await markReceivablePaid(receivable.id, 'efectivo', payload)
      toast.success(`Cobrado en efectivo · ${formatDOP(getBalance(receivable))}`)
      await refreshAfterCollect()
      return true
    } catch (error) {
      toast.error(error.message || 'No se pudo registrar el cobro.')
      return false
    }
  }

  const openReceivablePaymentModal = async (row) => {
    if (!canCollectReceivables) {
      toast.error('No tienes permiso para registrar cobros.')
      return
    }
    const receivable = await resolveReceivableForCollect(row)
    if (receivable) setCollectPaymentRow(receivable)
    else toast.error('No se encontró la cuenta por cobrar.')
  }

  const openReceivableProofModal = async (row) => {
    if (!canCollectReceivables) {
      toast.error('No tienes permiso para registrar cobros.')
      return
    }
    const receivable = await resolveReceivableForCollect(row)
    if (receivable) setCollectProofRow(receivable)
    else toast.error('No se encontró la cuenta por cobrar.')
  }

  const printReceivableInvoice = async (receivable) => {
    const sale = sales.find((item) => item.id === receivable.saleId)
      || await ensureSaleDetail(receivable.saleId)
    if (!sale) {
      toast.error('No se encontró la factura asociada')
      return
    }
    printSaleInvoice(sale, documentCtx)
    toast.success('Enviando factura a impresión…')
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-cotizaciones">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-bold text-slate-900">Cotizaciones y facturas</h2>
          <p className="text-sm text-slate-500">
            {stats.total} cotizaciones
            {stats.porCobrar > 0 ? ` · ${stats.porCobrar} por cobrar` : ''}
            {' · '}
            {formatDOP(stats.valor)} en pipeline
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <BranchMultiSelect
            branches={branches}
            branchIds={branchIds}
            onChange={setBranchIds}
            className={cn(CRM_BRANCH_FILTER_CLASS, 'w-full min-w-[200px] sm:w-auto sm:max-w-sm')}
            testId="cotizaciones-branch-filter"
          />
          <ExportMenu
            title="Cotizaciones CRM"
            columns={[
              { key: 'numero', label: 'Número' },
              { key: 'cliente', label: 'Cliente' },
              { key: 'estado', label: 'Estado' },
              { key: 'factura', label: 'Factura' },
              { key: 'total', label: 'Total' },
              { key: 'fecha', label: 'Fecha' },
            ]}
            rows={exportRows}
            filename="cotizaciones_crm"
          />
          <Button
            onClick={openCreate}
            className="shrink-0 whitespace-nowrap"
            data-testid="cotizaciones-new-quote"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Nueva cotización
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: 'Total', value: stats.total },
          { label: 'Enviadas', value: stats.enviadas },
          { label: 'Aceptadas', value: stats.aceptadas },
          { label: 'Por cobrar', value: stats.porCobrar },
          { label: 'Valor total', value: formatDOP(stats.valor) },
        ].map((s) => (
              <Card key={s.label} className="p-4">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="font-heading text-xl font-bold text-slate-900">{s.value}</p>
              </Card>
        ))}
      </div>

      <div className="space-y-3">
        {visibleQuotes.map((q) => {
          const pending = isQuoteInvoicePending(q, receivables)
          const collectRow = pending ? collectRowForQuote(q, receivables, sales) : null
          return (
              <Card key={q.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-700">{q.number}</span>
                      <Badge tone={QUOTE_STATUS_META[q.status]?.tone || 'neutral'}>
                        {QUOTE_STATUS_META[q.status]?.label}
                      </Badge>
                      {isQuoteInvoiced(q) && (
                        <Badge tone="success" data-testid={`quote-invoiced-${q.id}`}>
                          Facturada{q.invoiceNumber ? ` · ${q.invoiceNumber}` : ''}
                        </Badge>
                      )}
                      {pending && isQuoteInvoicePendingValidation(q) && (
                        <Badge tone="warning" data-testid={`quote-pending-validation-${q.id}`}>
                          Pendiente validación
                        </Badge>
                      )}
                      {pending && !isQuoteInvoicePendingValidation(q) && (
                        <Badge tone="warning" data-testid={`quote-pending-${q.id}`}>
                          Por cobrar
                        </Badge>
                      )}
                      {isQuoteInvoicePaid(q, receivables) && (
                        <button
                          type="button"
                          onClick={() => setPaymentDetailQuote(q)}
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                          data-testid={`quote-paid-${q.id}`}
                          aria-label={`Ver pago de ${q.invoiceNumber || q.number}`}
                        >
                          <Badge tone="success" className="cursor-pointer transition hover:brightness-95">
                            Pagada
                          </Badge>
                        </button>
                      )}
                    </div>
                    <p className="mt-1 font-semibold text-slate-900">{q.customerName}</p>
                    <p className="text-sm text-slate-500">Válida hasta {fmtDate(q.validUntil)}</p>
                    {q.items?.length > 0 && (
                      <ul className="mt-2 text-sm text-slate-600">
                        {q.items.map((it, i) => (
                          <li key={i}>{it.name} × {it.qty} — {formatDOP(it.price)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <p className="font-heading text-lg font-bold text-emerald-600">{formatDOP(q.total)}</p>
                    {canEmitQuoteInvoice(q) && (
                      <Button size="sm" onClick={() => openInvoice(q)} data-testid={`quote-invoice-${q.id}`}>
                        <Receipt className="h-4 w-4" />
                        Emitir factura
                      </Button>
                    )}
                    {pending && collectRow && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => printReceivableInvoice(collectRow)}
                          data-testid={`quote-invoice-pdf-${q.id}`}
                        >
                          <Printer className="h-4 w-4" />
                          PDF
                        </Button>
                        {canCollectReceivables && (
                          <>
                            <button
                              type="button"
                              title="Registrar pago"
                              onClick={() => openReceivablePaymentModal(collectRow)}
                              className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                              data-testid={`quote-collect-pay-${q.id}`}
                            >
                              <DollarSign className="h-4 w-4" />
                            </button>
                            <ReceivableCollectMenu
                              row={collectRow}
                              onConfirm={handleConfirmReceivable}
                              onCash={handleCashReceivable}
                              onProof={openReceivableProofModal}
                              testId={`quote-collect-menu-${q.id}`}
                            />
                          </>
                        )}
                      </>
                    )}
                    {isQuoteEditable(q) && (
                      <button
                        type="button"
                        onClick={() => openEdit(q)}
                        aria-label={`Editar ${q.number}`}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        data-testid={`quote-edit-${q.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => printQuote(q)}
                      aria-label={`Imprimir ${q.number}`}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                      data-testid={`quote-print-${q.id}`}
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadQuote(q)}
                      aria-label={`Descargar ${q.number}`}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                      data-testid={`quote-download-${q.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {!isQuoteInvoiced(q) && (
                      <Select
                        value={q.status}
                        onChange={(status) => changeStatus(q.id, status)}
                        options={QUOTE_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_META[s].label }))}
                        className="w-36"
                      />
                    )}
                    {!isQuoteInvoiced(q) && (
                      <button
                        type="button"
                        onClick={() => cancelQuote(q.id)}
                        aria-label={`Cancelar ${q.number}`}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
          )
        })}
      </div>

      <QuoteFormModal
        open={formOpen}
        onClose={closeForm}
        quote={editingQuote}
        initialContext={initialContext}
      />

      <QuoteInvoiceModal
        open={Boolean(invoiceQuoteRow)}
        onClose={() => !invoiceLoading && setInvoiceQuoteRow(null)}
        quote={invoiceQuoteRow}
        customer={invoiceQuoteRow
          ? customers.find((item) => item.id === invoiceQuoteRow.customerId)
          : null}
        paymentMethods={paymentMethods}
        online={isOnline}
        onSyncPaymentMethods={isOnline ? syncPaymentMethodsForInvoice : undefined}
        onConfirm={confirmInvoice}
        loading={invoiceLoading}
      />

      <PermissionElevationModal
        open={elevationOpen}
        onClose={() => setElevationOpen(false)}
        permissionCode={QUOTE_INVOICE_PERMISSION}
        title="Permiso para facturar"
        description="Necesitas permiso de venta para emitir facturas desde cotizaciones."
      />

      <ReceivablePaymentModal
        open={Boolean(collectPaymentRow)}
        onClose={() => setCollectPaymentRow(null)}
        receivable={collectPaymentRow}
      />

      <ReceivableProofModal
        open={Boolean(collectProofRow)}
        onClose={() => setCollectProofRow(null)}
        receivable={collectProofRow}
        onConfirm={async (receivable, payload) => {
          if (await handleConfirmReceivable(receivable, payload)) setCollectProofRow(null)
        }}
        onCash={async (receivable, payload) => {
          if (await handleCashReceivable(receivable, payload)) setCollectProofRow(null)
        }}
        onSaveOnly={async (receivable, payload) => {
          if (!canCollectReceivables) {
            toast.error('No tienes permiso para adjuntar comprobantes.')
            return
          }
          try {
            await attachReceivableProof(receivable.id, payload)
            toast.success('Comprobante guardado')
            setCollectProofRow(null)
            await refreshAfterCollect()
          } catch (error) {
            toast.error(error.message || 'No se pudo guardar el comprobante.')
          }
        }}
      />

      <QuotePaymentDetailModal
        open={Boolean(paymentDetailQuote)}
        onClose={() => setPaymentDetailQuote(null)}
        quote={paymentDetailQuote}
      />
    </div>
  )
}
