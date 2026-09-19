import { useCrmCapabilities } from '@/modules/crm/hooks/useCrmCapabilities'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { List, Search, ScanSearch, MapPin, Phone, Globe, Import, UserCheck, Briefcase, Plus, Pencil, Trash2, CheckSquare, Square } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { searchBusinesses } from '@/services/leadSearch'
import {
  OPPORTUNITY_STAGES,
  SOURCE_LABELS,
  ACQUISITION_SOURCE_LABELS,
  STAGE_META,
} from '@/data/crm'
import { leadPipelineStage, opportunityStageToLeadStatus } from '../lib/pipelineLeads'
import { buildLeadWhatsAppVariables } from '@/lib/whatsapp'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { matchesBranches } from '@/lib/branches'
import { useConfigStore } from '@/stores/configStore'
import { LeadStarRating, sortLeadsByStarRating } from '../components/LeadStarRating'
import { WhatsAppMenuButton } from '@/components/ui/WhatsAppMenuButton'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { cn } from '@/lib/utils'
import { LeadFormModal } from '../components/LeadFormModal'
import { LeadHandoffStrip } from '../components/LeadHandoffStrip'
import { FEATURES } from '@/config/features'
import { useSessionStore } from '@/stores/sessionStore'
import { Pagination } from '@/modules/reportes/components/Pagination'
import { paginateSlice } from '@/modules/reportes/lib/pagination'
import { CRM_PAGE_SIZE_OPTIONS, DEFAULT_CRM_PAGE_SIZE } from '@/modules/crm/constants/paging'
import { BulkSelectionBar } from '@/components/ui/BulkSelectionBar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { nextSelectAllState } from '@/lib/listSelection'

const TABS = [
  { id: 'lista', label: 'Lista', icon: List },
  ...(FEATURES.crmDiscovery ? [{ id: 'descubrir', label: 'Descubrir', icon: ScanSearch }] : []),
]

const STAR_SORT_OPTIONS = [
  { value: 'none', label: 'Orden: recientes' },
  { value: 'desc', label: 'Estrellas: mayor a menor' },
  { value: 'asc', label: 'Estrellas: menor a mayor' },
]

function LeadsListaTab({ onEditLead }) {
  const can = useCrmCapabilities()
  const leads = useCrmStore((s) => s.leads)
  const opportunities = useCrmStore((s) => s.opportunities)
  const branches = useConfigStore((s) => s.branches)
  const businessName = useConfigStore((s) => s.settings?.businessName || '')
  const convertToCustomer = useCrmStore((s) => s.convertToCustomer)
  const addToPipeline = useCrmStore((s) => s.addToPipeline)
  const updateLead = useCrmStore((s) => s.updateLead)
  const updateOpportunity = useCrmStore((s) => s.updateOpportunity)
  const setLeadStarRating = useCrmStore((s) => s.setLeadStarRating)
  const leadsListMeta = useCrmStore((s) => s.leadsListMeta)
  const fetchLeadsPage = useCrmStore((s) => s.fetchLeadsPage)
  const setLeadsPage = useCrmStore((s) => s.setLeadsPage)
  const setLeadsPageSize = useCrmStore((s) => s.setLeadsPageSize)
  const deleteLeads = useCrmStore((s) => s.deleteLeads)
  const online = useSessionStore((s) => s.status === 'online')
  const [offlinePage, setOfflinePage] = useState(1)
  const [offlinePageSize, setOfflinePageSize] = useState(DEFAULT_CRM_PAGE_SIZE)

  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [branchIds, setBranchIds] = useState([])
  const [starSort, setStarSort] = useState('none')
  const [handoff, setHandoff] = useState(null)

  const opportunityByLeadId = useMemo(() => {
    const map = new Map()
    for (const opp of opportunities) {
      if (opp.leadId) map.set(opp.leadId, opp)
    }
    return map
  }, [opportunities])

  useEffect(() => {
    if (!online) return undefined
    const branchId = branchIds.length === 1 ? branchIds[0] : undefined
    const handle = window.setTimeout(() => {
      fetchLeadsPage({ page: 1, search: query.trim(), branchId }).catch(() => {})
    }, query.trim() ? 400 : 0)
    return () => window.clearTimeout(handle)
  }, [online, query, branchIds, fetchLeadsPage])

  useEffect(() => {
    setOfflinePage(1)
  }, [query, stageFilter, branchIds, starSort, offlinePageSize])

  const filtered = useMemo(() => {
    const q = online ? '' : query.trim().toLowerCase()
    const rows = leads.filter((l) => {
      const stage = leadPipelineStage(l, opportunityByLeadId.get(l.id))
      if (stageFilter !== 'all' && stage !== stageFilter) return false
      if (!online || branchIds.length > 1) {
        if (!matchesBranches(l, branchIds)) return false
      }
      if (!q) return true
      return [l.name, l.company, l.location, l.phone, l.email].some((f) => f && `${f}`.toLowerCase().includes(q))
    })
    if (starSort === 'desc' || starSort === 'asc') {
      return sortLeadsByStarRating(rows, starSort)
    }
    return rows
  }, [leads, query, stageFilter, branchIds, starSort, opportunityByLeadId, online])

  const offlinePaged = useMemo(
    () => paginateSlice(filtered, { page: offlinePage, pageSize: offlinePageSize }),
    [filtered, offlinePage, offlinePageSize],
  )

  const list = online ? filtered : offlinePaged.items
  const paginationMeta = online
    ? {
      page: leadsListMeta.page || 1,
      totalPages: Math.max(1, leadsListMeta.totalPages || 1),
      total: leadsListMeta.totalItems || 0,
      pageSize: leadsListMeta.pageSize || DEFAULT_CRM_PAGE_SIZE,
      from: leadsListMeta.totalItems === 0 ? 0 : ((leadsListMeta.page - 1) * leadsListMeta.pageSize) + 1,
      to: Math.min(leadsListMeta.page * leadsListMeta.pageSize, leadsListMeta.totalItems),
    }
    : {
      page: offlinePaged.page,
      totalPages: offlinePaged.totalPages,
      total: offlinePaged.total,
      pageSize: offlinePaged.pageSize,
      from: offlinePaged.from,
      to: offlinePaged.to,
    }

  const selectableLeadIds = useMemo(
    () => list.filter((lead) => lead.status !== 'convertido').map((lead) => lead.id),
    [list],
  )

  const toggleSelected = (leadId) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const runDeleteLeads = async (ids) => {
    setDeleting(true)
    try {
      const chunks = []
      for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
      let deleted = 0
      let errors = 0
      for (const chunk of chunks) {
        const result = await deleteLeads(chunk)
        for (const row of result.items || []) {
          if (row.status === 'deleted') deleted += 1
          else errors += 1
        }
      }
      if (deleted) toast.success(deleted === 1 ? 'Lead eliminado' : `${deleted} lead(s) eliminados`)
      if (errors) toast.error(`${errors} no se pudieron eliminar (convertidos, cotizaciones o sin acceso).`)
      exitSelectMode()
    } catch (error) {
      toast.error(error.message || 'No se pudo completar la eliminación')
    } finally {
      setDeleting(false)
      setConfirm(null)
    }
  }

  const requestDeleteLead = (lead) => {
    if (lead.status === 'convertido') {
      toast.error('No se puede eliminar un lead convertido.')
      return
    }
    setConfirm({
      title: 'Eliminar lead',
      description: `¿Eliminar el lead "${lead.company || lead.name}"? También se quita su oportunidad si no tiene cotizaciones.`,
      onConfirm: () => runDeleteLeads([lead.id]),
    })
  }

  const requestDeleteSelectedLeads = () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setConfirm({
      title: 'Eliminar leads',
      description: `¿Eliminar ${ids.length} lead(s) seleccionados? Los convertidos o con cotizaciones se omitirán.`,
      onConfirm: () => runDeleteLeads(ids),
    })
  }

  const setLeadPipelineStage = async (lead, stage) => {
    const opportunity = opportunityByLeadId.get(lead.id)
    try {
      if (opportunity) {
        const patch = { stage }
        if (stage === 'perdido' && !opportunity.lostReason) {
          patch.lostReason = 'Otro'
        }
        await updateOpportunity(opportunity.id, patch)
      } else {
        await updateLead(lead.id, { status: opportunityStageToLeadStatus(stage) })
      }
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar la etapa')
    }
  }

  const sendToPipeline = async (leadId) => {
    try {
      const opportunity = await addToPipeline(leadId)
      if (!opportunity) return toast.error('No se encontró el lead')
      const lead = useCrmStore.getState().leads.find((item) => item.id === leadId)
      setHandoff({
        leadId,
        opportunityId: opportunity.id,
        customerId: opportunity.customerId || lead?.customerId || null,
      })
      toast.success('Oportunidad creada. Elige el siguiente paso en la tarjeta del lead.')
    } catch (error) {
      toast.error(error.message || 'No se pudo enviar el lead al pipeline')
    }
  }

  const convertLead = async (leadId) => {
    try {
      const customer = await convertToCustomer(leadId)
      const lead = useCrmStore.getState().leads.find((item) => item.id === leadId)
      const opportunity = useCrmStore.getState().opportunities.find((item) => item.leadId === leadId)
      setHandoff({
        leadId,
        customerId: customer?.id || lead?.customerId || null,
        opportunityId: opportunity?.id || lead?.opportunityId || null,
      })
      toast.success('Lead convertido a cliente')
    } catch (error) {
      toast.error(error.message || 'No se pudo convertir el lead')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar leads..."
            className="w-full rounded-xl border-0 bg-white py-3 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <Select
          value={stageFilter}
          onChange={setStageFilter}
          options={[
            { value: 'all', label: 'Todas las etapas' },
            ...OPPORTUNITY_STAGES.map((s) => ({ value: s, label: STAGE_META[s].label })),
          ]}
          className="w-full sm:w-48"
        />
        <BranchMultiSelect
          branches={branches}
          branchIds={branchIds}
          onChange={setBranchIds}
          className="w-full sm:w-56"
          testId="leads-branch-filter"
        />
        <Select
          value={starSort}
          onChange={setStarSort}
          options={STAR_SORT_OPTIONS}
          className="w-full sm:w-56"
          testId="leads-star-sort"
        />
        {can.manage && (
          <Button
            type="button"
            variant={selectMode ? 'secondary' : 'ghost'}
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            data-testid="leads-select-mode"
          >
            {selectMode ? 'Cancelar selección' : 'Seleccionar'}
          </Button>
        )}
      </div>

      {selectMode && can.manage && (
        <BulkSelectionBar
          selectedCount={selectedIds.size}
          totalSelectable={selectableLeadIds.length}
          onSelectAll={() => setSelectedIds(nextSelectAllState(selectedIds, selectableLeadIds))}
          onDelete={requestDeleteSelectedLeads}
          deleting={deleting}
          testId="leads-batch"
        />
      )}

      <div className="space-y-3">
        {list.map((lead) => {
          const opportunity = opportunityByLeadId.get(lead.id)
          const pipelineStage = leadPipelineStage(lead, opportunity)
          const meta = STAGE_META[pipelineStage]
          return (
            <Card key={lead.id} className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                  {selectMode && can.manage && lead.status !== 'convertido' && (
                    <button
                      type="button"
                      className="mt-1 shrink-0 text-slate-500 hover:text-blue-600"
                      aria-label={selectedIds.has(lead.id) ? 'Quitar selección' : 'Seleccionar lead'}
                      onClick={() => toggleSelected(lead.id)}
                    >
                      {selectedIds.has(lead.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                    </button>
                  )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-semibold text-slate-900">{lead.company || lead.name}</h3>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <Badge tone="neutral">{SOURCE_LABELS[lead.source] || lead.source}</Badge>
                    {lead.acquisitionSource && (
                      <Badge tone="brand">
                        {ACQUISITION_SOURCE_LABELS[lead.acquisitionSource] || lead.acquisitionSource}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                    {lead.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{lead.location}</span>}
                    {lead.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>}
                    {lead.website && <span className="inline-flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{lead.website}</span>}
                  </div>
                  {lead.rawSnippet && <p className="text-sm text-slate-500">{lead.rawSnippet}</p>}
                  <LeadStarRating
                    value={lead.starRating}
                    disabled={!can.manage}
                    onChange={(rating) => setLeadStarRating(lead.id, rating)}
                  />
                </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {lead.phone && (
                    <WhatsAppMenuButton
                      phone={lead.phone}
                      context="oportunidades"
                      size="sm"
                      variables={buildLeadWhatsAppVariables(lead, { sellerName: businessName, branches })}
                      data-testid={`lead-wa-${lead.id}`}
                    />
                  )}
                  {can.manage && lead.status !== 'convertido' && !selectMode && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => onEditLead(lead)} data-testid={`lead-edit-${lead.id}`}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={deleting}
                        onClick={() => requestDeleteLead(lead)}
                        data-testid={`lead-delete-${lead.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </Button>
                      {lead.opportunityId ? (
                        <Button size="sm" variant="secondary" disabled>
                          <Briefcase className="h-3.5 w-3.5" /> En pipeline
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => sendToPipeline(lead.id)}>
                          <Briefcase className="h-3.5 w-3.5" /> Pipeline
                        </Button>
                      )}
                      <Button size="sm" disabled={!can.convert} onClick={() => convertLead(lead.id)}>
                        <UserCheck className="h-3.5 w-3.5" /> Convertir
                      </Button>
                    </>
                  )}
                  <Select
                    disabled={!can.manage}
                    value={pipelineStage}
                    onChange={(v) => setLeadPipelineStage(lead, v)}
                    options={OPPORTUNITY_STAGES.map((s) => ({ value: s, label: STAGE_META[s].label }))}
                    className="w-40"
                  />
                </div>
              </div>
              {handoff?.leadId === lead.id && (
                <LeadHandoffStrip handoff={handoff} onDismiss={() => setHandoff(null)} />
              )}
            </Card>
          )
        })}
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay leads que coincidan.</p>}
        {(list.length > 0 || paginationMeta.total > 0) && (
          <Card className="p-4">
            <Pagination
              page={paginationMeta.page}
              totalPages={paginationMeta.totalPages}
              total={paginationMeta.total}
              from={paginationMeta.from}
              to={paginationMeta.to}
              pageSize={paginationMeta.pageSize}
              pageSizeOptions={CRM_PAGE_SIZE_OPTIONS}
              onPageChange={(page) => {
                if (online) setLeadsPage(page).catch(() => {})
                else setOfflinePage(page)
              }}
              onPageSizeChange={(size) => {
                if (online) setLeadsPageSize(size).catch(() => {})
                else setOfflinePageSize(size)
              }}
              noun="leads"
              testId="leads-pagination"
            />
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => !deleting && setConfirm(null)}
        onConfirm={() => confirm?.onConfirm?.()}
        title={confirm?.title || ''}
        description={confirm?.description}
        confirmLabel="Eliminar"
        busy={deleting}
        testId="leads-confirm-delete"
      />
    </div>
  )
}

function LeadsDescubrirTab() {
  const addLeadsBatch = useCrmStore((s) => s.addLeadsBatch)
  const branches = useConfigStore((state) => state.branches)

  const [q, setQ] = useState('')
  const [location, setLocation] = useState('Santo Domingo, República Dominicana')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [branchId, setBranchId] = useState('')

  useEffect(() => {
    if (branches.some((branch) => branch.id === branchId && branch.active)) return
    setBranchId(branches.find((branch) => branch.active)?.id || '')
  }, [branchId, branches])

  const runSearch = async () => {
    if (!q.trim()) return toast.error('Ingresa un término de búsqueda')
    setLoading(true)
    setResults([])
    setSelected(new Set())
    try {
      const { results: found } = await searchBusinesses({ q: q.trim(), location: location.trim(), num: 10 })
      setResults(found)
      if (found.length === 0) toast.info('Sin resultados para esta búsqueda')
    } catch (err) {
      if (err.code === 'QUOTA_EXCEEDED') toast.error('Límite de búsquedas alcanzado. Intenta más tarde.')
      else toast.error('No se pudo completar la búsqueda. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = (idx) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const importSelected = async () => {
    if (!branchId) return toast.error('Selecciona una sucursal')
    const items = [...selected].map((i) => ({ ...results[i], branchId }))
    if (!items.length) return toast.error('Selecciona al menos un resultado')
    try {
      await addLeadsBatch(items, 'serp')
      toast.success(`${items.length} lead(s) importados y puntuados`)
      setResults([])
      setSelected(new Set())
    } catch (error) {
      toast.error(error.message || 'No se pudieron importar los leads')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: salón de belleza, restaurante..." className="rounded-xl border-0 bg-white px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ubicación" className="rounded-xl border-0 bg-white px-4 py-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600" />
        <BranchMultiSelect
          branches={branches}
          branchIds={branchId ? [branchId] : []}
          onChange={(ids) => setBranchId(ids[0] || '')}
          selectionMode="single"
          showAllOption={false}
          className="w-full"
          testId="leads-import-branch"
        />
      </div>
      <Button onClick={runSearch} disabled={loading}>
        <Search className="h-4 w-4" /> {loading ? 'Buscando...' : 'Buscar negocios'}
      </Button>

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{results.length} resultados · {selected.size} seleccionados</p>
            <Button onClick={importSelected} disabled={selected.size === 0}>
              <Import className="h-4 w-4" /> Importar seleccionados
            </Button>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <label key={i} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors', selected.has(i) ? 'border-blue-300 bg-blue-50/50' : 'border-slate-100 bg-white')}>
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="mt-1" />
                <div>
                  <p className="font-semibold text-slate-900">{r.name}</p>
                  {r.location && <p className="text-sm text-slate-500">{r.location}</p>}
                  {r.rawSnippet && <p className="mt-1 text-xs text-slate-400">{r.rawSnippet}</p>}
                </div>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const LEADS_SUBTITLE = FEATURES.crmDiscovery
  ? 'Descubre negocios, califícalos con estrellas y llévalos al pipeline o conviértelos en clientes.'
  : 'Registra leads, califícalos con estrellas y conviértelos en clientes u oportunidades.'

export default function LeadsPage() {
  const can = useCrmCapabilities()
  const [params, setParams] = useSearchParams()
  const [formOpen, setFormOpen] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const tabParam = params.get('tab') || 'lista'
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam : 'lista'
  const tabCols = 'grid-cols-2'

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="crm-leads">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Leads</h2>
          <p className="text-sm text-slate-500">{LEADS_SUBTITLE}</p>
        </div>
        <Button onClick={() => setFormOpen(true)} data-testid="lead-new" disabled={!can.manage}>
          <Plus className="h-4 w-4" /> Nuevo lead
        </Button>
      </div>

      <div className={cn('grid w-full max-w-lg rounded-xl bg-slate-100 p-1', tabCols)}>
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setParams({ tab: t.id })}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      <AnimatedTabPanel panelKey={tab}>
        {tab === 'descubrir' && <LeadsDescubrirTab />}
        {tab === 'lista' && <LeadsListaTab onEditLead={setEditingLead} />}
      </AnimatedTabPanel>
      <LeadFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <LeadFormModal
        open={Boolean(editingLead)}
        lead={editingLead}
        onClose={() => setEditingLead(null)}
      />
    </div>
  )
}
