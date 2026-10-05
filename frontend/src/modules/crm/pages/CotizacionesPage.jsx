import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, Printer, Download, Pencil, Receipt } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { useConfigStore } from '@/stores/configStore'
import { useCustomersStore } from '@/stores/customersStore'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { CRM_BRANCH_FILTER_CLASS, matchesBranches } from '@/lib/branches'
import { QUOTE_STATUSES, QUOTE_STATUS_META } from '@/data/crm'
import { fmtDate, fmtDateTime, saleStatusBadge, saleRowHighlightClass } from '../lib/crm'
import {
  CRM_DOC_TABS,
  buildCrmDocumentRows,
  documentRowTypeLabel,
  filterDocumentRows,
  parseDocFilter,
} from '../lib/quoteDocuments'
import { SaleDetailModal } from '../components/SaleDetailModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { FileText } from 'lucide-react'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardFooter,
} from '@/components/ui/ResponsiveList'
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
import { isActiveCrmQuote, isDiscardedCrmQuote } from '@/modules/crm/lib/crmQuoteVisibility'
import {
  canEmitQuoteInvoice,
  isQuoteInvoiced,
  isQuoteInvoicePaid,
  isQuoteInvoicePending,
  isQuoteInvoicePendingValidation,
  collectRowForQuote,
  quoteConvertedSaleId,
  resolveQuoteBilling,
  QUOTE_INVOICE_PERMISSION,
} from '../lib/quoteInvoice'
import { QuotePaymentDetailModal } from '../components/QuotePaymentDetailModal'
import { PermissionElevationModal } from '@/components/auth/PermissionElevationModal'
import { ReceivablePaymentModal } from '@/modules/pos/components/ReceivablePaymentModal'
import { ReceivableProofModal } from '@/modules/pos/components/ReceivableProofModal'
import { resolveQuoteReceivableForCollect } from '../lib/resolveQuoteReceivableForCollect'
import { mapReceivableFromApi, mapReceivablesPageFromApi } from '@/services/adapters/pos'
import { posApi } from '@/services/posApi'
import { getBalance, receivableHasPaymentEvidence } from '@/modules/pos/lib/receivables'
import { syncWorkspacePaymentMethods } from '@/lib/paymentMethodsSync'
import { SimplifiedCrmSectionNav } from '@/modules/crm/components/SimplifiedCrmSectionNav'
import { DatePeriodFilter } from '@/components/ui/DatePeriodFilter'
import { IncrementalListFooter } from '@/components/ui/IncrementalListFooter'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import {
  defaultQuotesDateFilter,
  quotesUpdatedRange,
  QUOTES_DATE_PERIODS,
} from '@/modules/crm/lib/quotesListQuery'
import { crmApi } from '@/services/crmApi'
import { mapLeadFromApi } from '@/services/adapters/crm'

export default function CotizacionesPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const uiMode = useCrmStore((s) => s.uiMode)
  const quotes = useCrmStore((s) => s.quotes)
  const sales = useCrmStore((s) => s.sales)
  const posSales = usePosStore((s) => s.sales)
  const branches = useConfigStore((s) => s.branches)
  const settings = useConfigStore((s) => s.settings)
  const paymentMethods = useConfigStore((s) => s.paymentMethods)
  const customers = useCustomersStore((s) => s.customers)
  const updateQuote = useCrmStore((s) => s.updateQuote)
  const deleteQuote = useCrmStore((s) => s.deleteQuote)
  const invoiceQuote = useCrmStore((s) => s.invoiceQuote)
  const hydrateQuotesSection = useCrmStore((s) => s.hydrateSection)
  const fetchQuotesPage = useCrmStore((s) => s.fetchQuotesPage)
  const loadMoreQuotes = useCrmStore((s) => s.loadMoreQuotes)
  const quotesListMeta = useCrmStore((s) => s.quotesListMeta)
  const ensureSaleDetail = useCrmStore((s) => s.ensureSaleDetail)
  const receivables = usePosStore((s) => s.receivables)
  const hydrateCxcWorkspace = usePosStore((s) => s.hydrateCxcWorkspace)
  const ensureReceivableDetail = usePosStore((s) => s.ensureReceivableDetail)
  const markReceivablePaid = usePosStore((s) => s.markReceivablePaid)
  const attachReceivableProof = usePosStore((s) => s.attachReceivableProof)
  const isOnline = useSessionStore((state) => state.isOnline())
  const canManage = useSessionStore((s) => s.status === 'demo' || (s.hasPermission('crm.manage') && s.hasPermission('sales.quote.manage')))
  const canInvoice = useSessionStore((state) => state.hasPermission(QUOTE_INVOICE_PERMISSION))
  const canCollectReceivables = useSessionStore((state) => state.hasPermission('pos.receivables.collect'))

  const [formOpen, setFormOpen] = useState(false)
  const [editingQuote, setEditingQuote] = useState(null)
  const [initialContext, setInitialContext] = useState(null)
  const [branchIds, setBranchIds] = useState([])
  const [dateFilter, setDateFilter] = useState(defaultQuotesDateFilter)
  const [invoiceQuoteRow, setInvoiceQuoteRow] = useState(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [elevationOpen, setElevationOpen] = useState(false)
  const [collectPaymentRow, setCollectPaymentRow] = useState(null)
  const [collectProofRow, setCollectProofRow] = useState(null)
  const [paymentDetailQuote, setPaymentDetailQuote] = useState(null)
  const [selectedSale, setSelectedSale] = useState(null)

  const isStandardCrm = uiMode !== 'simplified'
  const docFilter = parseDocFilter(searchParams.get('doc'))

  const requestedCustomerId = searchParams.get('customerId') || ''
  const requestedLeadId = searchParams.get('leadId') || ''
  const requestedQuoteId = searchParams.get('quoteId') || ''

  useEffect(() => {
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
  }, [hydrateCxcWorkspace, hydrateQuotesSection])

  useEffect(() => {
    if (!isOnline) return
    const range = quotesUpdatedRange(dateFilter)
    const branchId = branchIds.length === 1 ? branchIds[0] : null
    fetchQuotesPage({
      page: 1,
      branchId,
      updatedAfter: range?.start?.toISOString() || null,
      updatedBefore: range?.end?.toISOString() || null,
      append: false,
    }).catch(() => {})
  }, [branchIds, dateFilter, fetchQuotesPage, isOnline])

  const setDocFilter = (id) => {
    const next = new URLSearchParams(searchParams)
    if (id === 'all') next.delete('doc')
    else next.set('doc', id)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (!requestedQuoteId) return
    let cancelled = false
    const run = async () => {
      try {
        await hydrateQuotesSection('quotes')
      } catch {
        /* cached quotes */
      }
      const store = useCrmStore.getState()
      let quote = store.quotes.find((item) => item.id === requestedQuoteId)
      try {
        if (!quote) {
          quote = await store.ensureQuoteDetail(requestedQuoteId)
        }
      } catch {
        quote = null
      }
      if (!cancelled) {
        if (quote && isDiscardedCrmQuote(quote)) {
          toast.info('Esta cotización fue descartada.')
        } else if (quote && isActiveCrmQuote(quote)) {
          const el = document.querySelector(`[data-testid="quote-print-${quote.id}"]`)
            || document.querySelector(`[data-testid="cotizaciones-quote-row-${quote.id}"]`)
          el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
        } else {
          toast.error('La cotización ya no existe.')
        }
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('quoteId')
        setSearchParams(nextParams, { replace: true })
      }
    }
    run()
    return () => { cancelled = true }
  }, [requestedQuoteId, hydrateQuotesSection, searchParams, setSearchParams])

  useEffect(() => {
    if (requestedQuoteId || requestedCustomerId || !requestedLeadId) return
    let cancelled = false
    const openForLead = async () => {
      let lead = useCrmStore.getState().leads.find((item) => item.id === requestedLeadId)
      if (!lead && isOnline) {
        try {
          const response = await crmApi.getLead(requestedLeadId)
          lead = mapLeadFromApi(response)
          useCrmStore.setState((state) => ({
            leads: state.leads.some((item) => item.id === lead.id)
              ? state.leads
              : [lead, ...state.leads],
          }))
        } catch {
          lead = null
        }
      }
      if (cancelled || !lead) return
      setEditingQuote(null)
      setInitialContext({
        leadId: lead.id,
        customerId: lead.customerId || '',
        branchId: lead.branchId || '',
      })
      setFormOpen(true)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('leadId')
      setSearchParams(nextParams, { replace: true })
    }
    openForLead()
    return () => { cancelled = true }
  }, [requestedLeadId, requestedCustomerId, requestedQuoteId, searchParams, setSearchParams, isOnline])

  useEffect(() => {
    if (requestedQuoteId || !requestedCustomerId || requestedLeadId) return
    const customer = customers.find((item) => item.id === requestedCustomerId)
    if (!customer) return
    setEditingQuote(null)
    setInitialContext({
      customerId: customer.id,
      branchId: customer.branchIds?.[0] || customer.branchId || '',
    })
    setFormOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('customerId')
    setSearchParams(nextParams, { replace: true })
  }, [customers, requestedCustomerId, requestedLeadId, requestedQuoteId, searchParams, setSearchParams])

  const enrichedQuotes = useMemo(
    () => quotes.map((quote) => resolveQuoteBilling(quote, receivables, sales)),
    [quotes, receivables, sales]
  )

  const visibleQuotes = useMemo(() => {
    return enrichedQuotes
      .filter((q) => !isQuoteInvoiced(q))
      .filter((q) => isActiveCrmQuote(q))
      .filter((q) => matchesBranches(q, branchIds, (row) => (row.branchId ? [row.branchId] : [])))
  }, [enrichedQuotes, branchIds])

  const standardDocumentRows = useMemo(() => {
    const rows = buildCrmDocumentRows({
      quotes,
      crmSales: sales,
      posSales,
      receivables,
    })
    return filterDocumentRows(rows, docFilter).filter((row) => matchesBranches(
      row,
      branchIds,
      (item) => (item.branchId ? [item.branchId] : []),
    ))
  }, [quotes, sales, posSales, receivables, docFilter, branchIds])

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

  const removeQuote = async (quoteId) => {
    try {
      await deleteQuote(quoteId)
      toast.success('Cotización descartada')
    } catch (error) {
      toast.error(error.message || 'No se pudo descartar la cotización')
    }
  }

  const printQuote = (quote) => {
    printQuoteDocument(quote, documentCtx).catch((error) => {
      toast.error(error.message || 'No se pudo imprimir la cotización.')
    })
    toast.success('Enviando cotización a impresión…')
  }

  const downloadQuote = (quote) => {
    downloadQuotePdf(quote, documentCtx).catch((error) => {
      toast.error(error.message || 'No se pudo descargar la cotización.')
    })
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
      const parkedHint = result.parkedForNextShift
        ? ' La caja está cerrada: esta venta y sus comprobantes irán al cuadre del próximo turno.'
        : ''
      toast.success(
        (status === 'pending_validation'
          ? `Factura ${result.sale.number} emitida · pendiente de validación`
          : status === 'receivable'
            ? `Factura ${result.sale.number} emitida · queda por cobrar`
            : `Factura ${result.sale.number} emitida y cobrada`) + parkedHint
      )
      setInvoiceQuoteRow(null)
      if (result?.sale) {
        setSelectedSale(result.sale)
      }
      const meta = useCrmStore.getState().quotesListMeta
      await Promise.all([
        fetchQuotesPage({
          page: 1,
          pageSize: meta.pageSize,
          branchId: meta.branchId,
          updatedAfter: meta.updatedAfter,
          updatedBefore: meta.updatedBefore,
          append: false,
        }),
        useCrmStore.getState().hydrateSection('sales'),
      ])
      await hydrateCxcWorkspace({ force: true })
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

    const upsertReceivable = (receivable) => {
      if (!receivable?.id) return
      usePosStore.setState((state) => ({
        receivables: [receivable, ...state.receivables.filter((item) => item.id !== receivable.id)],
      }))
    }

    const found = await resolveQuoteReceivableForCollect({
      row,
      quote,
      sales: latestSales,
      receivables: storeReceivables,
      isOnline,
      ensureReceivableDetail,
      listAllReceivables: async () => {
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
        return allItems
      },
      getReceivableForSale: async (saleId) => {
        const response = await posApi.getReceivableForSale(saleId)
        const mapped = mapReceivableFromApi(response)
        upsertReceivable(mapped)
        return mapped
      },
    })

    if (found) upsertReceivable(found)
    return found
  }

  const refreshQuotesList = async () => {
    const meta = useCrmStore.getState().quotesListMeta
    await fetchQuotesPage({
      page: 1,
      pageSize: meta.pageSize,
      branchId: meta.branchId,
      updatedAfter: meta.updatedAfter,
      updatedBefore: meta.updatedBefore,
      append: false,
    })
  }

  const refreshAfterCollect = async () => {
    await Promise.all([
      refreshQuotesList(),
      useCrmStore.getState().hydrateSection('sales'),
      hydrateCxcWorkspace({ force: true }),
    ])
  }

  const quotesHasMore = quotesListMeta.page < quotesListMeta.totalPages
  const quotesScrollSentinelRef = useInfiniteScroll({
    enabled: isOnline && quotesHasMore && !quotesListMeta.loading && !quotesListMeta.loadingMore,
    onLoadMore: () => loadMoreQuotes().catch(() => {}),
  })

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
    printSaleInvoice(sale, documentCtx).catch((error) => {
      toast.error(error.message || 'No se pudo imprimir la factura.')
    })
    toast.success('Enviando factura a impresión…')
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-cotizaciones">
      {uiMode === 'simplified' && <SimplifiedCrmSectionNav className="mb-2" />}
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
          <DatePeriodFilter
            period={dateFilter.period}
            dateFrom={dateFilter.dateFrom}
            dateTo={dateFilter.dateTo}
            onChange={setDateFilter}
            periods={QUOTES_DATE_PERIODS}
            testId="cotizaciones-date-filter"
          />
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
            disabled={!canManage}
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

      {isStandardCrm && (
        <div className="flex flex-wrap gap-2" data-testid="cotizaciones-doc-tabs">
          {CRM_DOC_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDocFilter(tab.id)}
              data-testid={`cotizaciones-doc-${tab.id}`}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                docFilter === tab.id
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {isStandardCrm ? (
        standardDocumentRows.length === 0 ? (
          <Card className="overflow-hidden">
            <EmptyState
              icon={FileText}
              title="Sin documentos"
              description="No hay cotizaciones ni facturas con los filtros actuales."
              className="py-14"
            />
          </Card>
        ) : (
          <ResponsiveList minTableWidth={960} columnCount={7}>
            <ResponsiveTable testId="cotizaciones-doc-table">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Número</th>
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4 text-right">Total</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {standardDocumentRows.map((row) => {
                    if (row.kind === 'invoice') {
                      const status = saleStatusBadge(row.sale, row.receivable)
                      const isVoided = row.sale.status === 'voided'
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedSale(row.sale)}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-blue-50/50',
                            isVoided && 'bg-slate-50/70 text-slate-400',
                            !isVoided && saleRowHighlightClass(row.sale, row.receivable),
                          )}
                          data-testid={`cotizaciones-invoice-row-${row.sale.id}`}
                        >
                          <td className="px-6 py-4">
                            <Badge tone="neutral">{documentRowTypeLabel(row)}</Badge>
                          </td>
                          <td className="px-6 py-4 font-mono font-semibold text-slate-700">{row.label}</td>
                          <td className="px-6 py-4 font-semibold text-slate-800">{row.customerName}</td>
                          <td className="px-6 py-4">
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td className="px-6 py-4 text-slate-500">{fmtDateTime(row.sortAt)}</td>
                          <td className="px-6 py-4 text-right font-heading font-bold text-blue-600">{formatDOP(row.total)}</td>
                          <td className="px-6 py-4 text-right text-xs text-slate-400">Ver detalle</td>
                        </tr>
                      )
                    }
                    const q = row.quote
                    const pending = isQuoteInvoicePending(q, receivables)
                    return (
                      <tr
                        key={row.id}
                        className="transition-colors hover:bg-slate-50/80"
                        data-testid={`cotizaciones-quote-row-${q.id}`}
                      >
                        <td className="px-6 py-4">
                          <Badge tone="brand">{documentRowTypeLabel(row)}</Badge>
                        </td>
                        <td className="px-6 py-4 font-mono font-semibold text-slate-700">{q.number}</td>
                        <td className="px-6 py-4 font-semibold text-slate-800">{q.customerName}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            <Badge tone={QUOTE_STATUS_META[q.status]?.tone || 'neutral'}>
                              {QUOTE_STATUS_META[q.status]?.label}
                            </Badge>
                            {pending && (
                              <Badge tone="warning">Por cobrar</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{fmtDate(q.createdAt)}</td>
                        <td className="px-6 py-4 text-right font-heading font-bold text-emerald-600">{formatDOP(q.total)}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {canEmitQuoteInvoice(q) && (
                              <Button size="sm" onClick={() => openInvoice(q)} data-testid={`quote-invoice-${q.id}`}>
                                <Receipt className="h-4 w-4" />
                                Facturar
                              </Button>
                            )}
                            {canManage && isQuoteEditable(q) && (
                              <button
                                type="button"
                                onClick={() => openEdit(q)}
                                aria-label={`Editar ${q.number}`}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => printQuote(q)}
                              aria-label={`Imprimir ${q.number}`}
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ResponsiveTable>
            <ResponsiveCards testId="cotizaciones-doc-cards">
              {standardDocumentRows.map((row) => {
                if (row.kind === 'invoice') {
                  const status = saleStatusBadge(row.sale, row.receivable)
                  return (
                    <MobileCard
                      key={row.id}
                      onClick={() => setSelectedSale(row.sale)}
                      testId={`cotizaciones-invoice-card-${row.sale.id}`}
                    >
                      <MobileCardHeader
                        title={row.customerName}
                        subtitle={row.label}
                        badge={<Badge tone={status.tone}>{status.label}</Badge>}
                      />
                      <MobileField label="Tipo">{documentRowTypeLabel(row)}</MobileField>
                      <MobileCardFooter>
                        <span className="text-xs text-slate-400">{fmtDateTime(row.sortAt)}</span>
                        <span className="font-heading font-bold text-blue-600">{formatDOP(row.total)}</span>
                      </MobileCardFooter>
                    </MobileCard>
                  )
                }
                const q = row.quote
                return (
                  <MobileCard key={row.id} testId={`cotizaciones-quote-card-${q.id}`}>
                    <MobileCardHeader
                      title={q.customerName}
                      subtitle={q.number}
                      badge={<Badge tone={QUOTE_STATUS_META[q.status]?.tone || 'neutral'}>{QUOTE_STATUS_META[q.status]?.label}</Badge>}
                    />
                    <MobileField label="Tipo">Cotización</MobileField>
                    <MobileCardFooter>
                      <span className="text-xs text-slate-400">{fmtDate(q.createdAt)}</span>
                      <span className="font-heading font-bold text-emerald-600">{formatDOP(q.total)}</span>
                    </MobileCardFooter>
                  </MobileCard>
                )
              })}
            </ResponsiveCards>
          </ResponsiveList>
        )
      ) : (
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
                          <Button
                            size="sm"
                            onClick={() => openReceivablePaymentModal(collectRow)}
                            data-testid={`quote-collect-${q.id}`}
                          >
                            Cobrar
                          </Button>
                        )}
                      </>
                    )}
                    {canManage && isQuoteEditable(q) && (
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
                    {canManage && !isQuoteInvoiced(q) && (
                      <Select
                        value={q.status}
                        onChange={(status) => changeStatus(q.id, status)}
                        options={QUOTE_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_META[s].label }))}
                        className="w-36"
                      />
                    )}
                    {canManage && !isQuoteInvoiced(q) && (
                      <button
                        type="button"
                        onClick={() => removeQuote(q.id)}
                        aria-label={`Eliminar ${q.number}`}
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
      )}

      {isStandardCrm && isOnline && (
        <>
          <div ref={quotesScrollSentinelRef} className="h-1 w-full shrink-0" aria-hidden />
          <IncrementalListFooter
            loaded={quotes.length}
            total={quotesListMeta.totalItems}
            loading={quotesListMeta.loading || quotesListMeta.loadingMore}
            hasMore={quotesHasMore}
            className="px-1"
          />
        </>
      )}

      <SaleDetailModal
        open={Boolean(selectedSale)}
        onClose={() => setSelectedSale(null)}
        sale={selectedSale}
      />

      <QuoteFormModal
        open={formOpen}
        onClose={closeForm}
        quote={editingQuote}
        initialContext={initialContext}
        onSaved={() => refreshQuotesList().catch(() => {})}
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
