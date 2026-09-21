import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { Loader2, Plus, Search, Pencil, Trash2, CheckSquare, Square } from 'lucide-react'
import { toast } from 'sonner'

import { useCrmStore } from '@/stores/crmStore'

import { useConfigStore } from '@/stores/configStore'

import { STAGE_META } from '@/data/crm'

import { Button } from '@/components/ui/Button'

import { Input } from '@/components/ui/Input'

import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'

import { Card } from '@/components/ui/Card'

import { Badge } from '@/components/ui/Badge'

import { DatePeriodFilter } from '@/components/ui/DatePeriodFilter'

import { LeadFormModal } from '@/modules/crm/components/LeadFormModal'

import { SimplifiedLeadActions } from '@/modules/crm/components/SimplifiedLeadActions'
import { SimplifiedCustomersPanel } from '@/modules/crm/components/SimplifiedCustomersPanel'
import { SimplifiedCrmSectionNav } from '@/modules/crm/components/SimplifiedCrmSectionNav'
import { resolveSimplifiedCrmSection } from '@/modules/crm/lib/crmNavigation'
import { useCrmCapabilities } from '@/modules/crm/hooks/useCrmCapabilities'
import { BulkSelectionBar } from '@/components/ui/BulkSelectionBar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { nextSelectAllState } from '@/lib/listSelection'

import { ACTIVITY_TYPE_META } from '@/data/crm'

import { cn } from '@/lib/utils'

import { Pagination } from '@/modules/reportes/components/Pagination'

import {

  SIMPLIFIED_WORKSPACE_DATE_PERIODS,

  defaultSimplifiedDateFilter,

} from '@/modules/crm/lib/simplifiedWorkspaceQuery'

const SIMPLIFIED_TABS = [

  { id: 'nuevo', label: 'Nuevos' },

  { id: 'contactado', label: 'Contactados' },

  { id: 'propuesta', label: 'Interesados' },

  { id: 'negociacion', label: 'Seguimiento' },

  { id: 'cerrado', label: 'Ganados' },

]



function opportunityTitle(opportunity, leads) {

  const lead = leads.find((item) => item.id === opportunity.leadId)

  return opportunity.customerName || lead?.name || lead?.company || 'Sin nombre'

}



export default function SimplifiedWorkspacePage() {
  const can = useCrmCapabilities()
  const { search } = useLocation()
  const workspaceSection = useMemo(
    () => resolveSimplifiedCrmSection('/crm/workspace', search),
    [search]
  )
  const leads = useCrmStore((state) => state.leads)
  const deleteLeads = useCrmStore((state) => state.deleteLeads)

  const simplifiedWorkspace = useCrmStore((state) => state.simplifiedWorkspace)

  const fetchQueue = useCrmStore((state) => state.fetchSimplifiedWorkspaceQueue)

  const fetchStageCounts = useCrmStore((state) => state.fetchSimplifiedWorkspaceStageCounts)

  const fetchDetailActivities = useCrmStore((state) => state.fetchSimplifiedWorkspaceDetailActivities)

  const branches = useConfigStore((state) => state.branches)



  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const [branchIds, setBranchIds] = useState([])

  const [stageTab, setStageTab] = useState('propuesta')

  const [selectedId, setSelectedId] = useState(null)

  const [leadModalOpen, setLeadModalOpen] = useState(false)

  const [dateFilter, setDateFilter] = useState(() => defaultSimplifiedDateFilter())

  const [page, setPage] = useState(1)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedLeadIds, setSelectedLeadIds] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [editLeadOpen, setEditLeadOpen] = useState(false)
  const [editingLead, setEditingLead] = useState(null)

  const {

    items: queueItems,

    pageSize,

    totalItems,

    totalPages,

    stageCounts,

    loading,

    detailActivities,

    detailActivitiesLoading,

  } = simplifiedWorkspace



  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query])

  const refreshWorkspace = useCallback(() => {
    const filters = { search: debouncedQuery, branchIds, dateFilter }
    fetchStageCounts(filters).catch(() => {})
    return fetchQueue({ stage: stageTab, page, pageSize, ...filters }).catch(() => {})
  }, [branchIds, dateFilter, debouncedQuery, fetchQueue, fetchStageCounts, page, pageSize, stageTab])

  useEffect(() => {
    refreshWorkspace()
  }, [refreshWorkspace])

  useEffect(() => {
    const { quotes, hydrateSection } = useCrmStore.getState()
    if (!quotes.length) hydrateSection('quotes').catch(() => {})
  }, [])



  const selected = useMemo(

    () => queueItems.find((item) => item.id === selectedId) || queueItems[0] || null,

    [queueItems, selectedId]

  )



  const selectedLead = selected

    ? leads.find((item) => item.id === selected.leadId)

    : null



  useEffect(() => {

    if (!selected?.id) return

    fetchDetailActivities(selected.id).catch(() => {})

  }, [fetchDetailActivities, selected?.id])



  const paginationFrom = totalItems === 0 ? 0 : (page - 1) * pageSize + 1

  const paginationTo = Math.min(page * pageSize, totalItems)



  const handleFiltersChange = () => {
    setPage(1)
    setSelectedId(null)
  }

  const selectableQueueLeadIds = useMemo(() => (
    queueItems
      .map((item) => item.leadId)
      .filter((leadId) => {
        if (!leadId) return false
        const lead = leads.find((item) => item.id === leadId)
        return lead && lead.status !== 'convertido'
      })
  ), [queueItems, leads])

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedLeadIds(new Set())
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
      if (errors) toast.error(`${errors} no se pudieron eliminar.`)
      if (selectedLead?.id && ids.includes(selectedLead.id)) setSelectedId(null)
      exitSelectMode()
      refreshWorkspace()
    } catch (error) {
      toast.error(error.message || 'No se pudo completar la eliminación')
    } finally {
      setDeleting(false)
      setConfirm(null)
    }
  }

  const requestDeleteLead = (lead) => {
    if (!lead || lead.status === 'convertido') {
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
    const ids = [...selectedLeadIds]
    if (!ids.length) return
    setConfirm({
      title: 'Eliminar leads',
      description: `¿Eliminar ${ids.length} lead(s) seleccionados? Los convertidos o con cotizaciones se omitirán.`,
      onConfirm: () => runDeleteLeads(ids),
    })
  }

  const toggleQueueLead = (leadId) => {
    if (!leadId) return
    setSelectedLeadIds((current) => {
      const next = new Set(current)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  return (

    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:space-y-6 sm:p-8" data-testid="crm-simplified-workspace">

      <SimplifiedCrmSectionNav
        trailing={
          workspaceSection === 'prospectos' ? (
            <Button className="w-full sm:w-auto" onClick={() => setLeadModalOpen(true)} data-testid="crm-simplified-register-lead">
              <Plus className="h-4 w-4" />
              Registrar lead
            </Button>
          ) : null
        }
      />

      {workspaceSection === 'clientes' ? (
        <SimplifiedCustomersPanel />
      ) : (
        <>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">

        <div className="relative flex-1 min-w-72">

          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

          <Input

            value={query}

            onChange={(event) => {

              setQuery(event.target.value)

              handleFiltersChange()

            }}

            placeholder="Buscar por nombre o teléfono"

            className="pl-9"

            data-testid="crm-simplified-search"

          />

        </div>

        <DatePeriodFilter

          period={dateFilter.period}

          dateFrom={dateFilter.dateFrom}

          dateTo={dateFilter.dateTo}

          periods={SIMPLIFIED_WORKSPACE_DATE_PERIODS}

          onChange={(next) => {

            setDateFilter(next)

            handleFiltersChange()

          }}

          testId="crm-simplified-date-filter"
        />

        <BranchMultiSelect

          branches={branches}

          branchIds={branchIds}

          onChange={(value) => {

            setBranchIds(value)

            handleFiltersChange()

          }}

          className="w-full xl:max-w-xs"

        />

        {can.manage && (
          <Button
            type="button"
            variant={selectMode ? 'secondary' : 'ghost'}
            className="w-full xl:w-auto"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            data-testid="crm-simplified-select-mode"
          >
            {selectMode ? 'Cancelar selección' : 'Seleccionar'}
          </Button>
        )}

      </div>

      {selectMode && can.manage && (
        <BulkSelectionBar
          selectedCount={selectedLeadIds.size}
          totalSelectable={selectableQueueLeadIds.length}
          onSelectAll={() => setSelectedLeadIds(nextSelectAllState(selectedLeadIds, selectableQueueLeadIds))}
          onDelete={requestDeleteSelectedLeads}
          deleting={deleting}
          testId="crm-simplified-leads-batch"
        />
      )}

      <div className="flex flex-wrap gap-2" data-testid="crm-simplified-tabs">

        {SIMPLIFIED_TABS.map((tab) => (

          <button

            key={tab.id}

            type="button"

            onClick={() => {

              setStageTab(tab.id)

              setPage(1)

              setSelectedId(null)

            }}

            className={cn(

              'rounded-full px-4 py-2 text-sm font-semibold transition-colors',

              stageTab === tab.id

                ? 'bg-slate-900 text-white'

                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'

            )}

          >

            {tab.label}

            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">

              {stageCounts[tab.id] ?? '—'}

            </span>

          </button>

        ))}

      </div>



      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr] lg:items-stretch">

        <Card
          className="flex min-h-[min(32rem,70vh)] flex-col overflow-hidden p-0 lg:min-h-[32rem]"
          data-testid="crm-simplified-queue"
        >

          <div className="shrink-0 border-b border-slate-100 px-4 py-3">

            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Por atender</p>

          </div>

          {loading ? (

            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500">

              <Loader2 className="h-8 w-8 animate-spin text-blue-600" data-testid="crm-simplified-queue-loading" />

              Cargando prospectos…

            </div>

          ) : (

            <div className="flex min-h-0 flex-1 flex-col">

              <ul className="min-h-0 flex-1 divide-y divide-slate-50 overflow-y-auto">

                {queueItems.length === 0 ? (

                  <li className="px-4 py-8 text-center text-sm text-slate-500">

                    No hay prospectos en esta etapa para el período seleccionado.

                  </li>

                ) : (

                  queueItems.map((item) => {

                    const title = opportunityTitle(item, leads)

                    const active = selected?.id === item.id

                    const lead = item.leadId ? leads.find((row) => row.id === item.leadId) : null
                    const canSelect = selectMode && can.manage && lead && lead.status !== 'convertido'

                    return (

                      <li key={item.id} className="flex items-stretch">

                        {canSelect && (
                          <button
                            type="button"
                            className="px-3 text-slate-500 hover:text-blue-600"
                            onClick={() => toggleQueueLead(item.leadId)}
                            aria-label={selectedLeadIds.has(item.leadId) ? 'Quitar selección' : 'Seleccionar lead'}
                          >
                            {selectedLeadIds.has(item.leadId) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                          </button>
                        )}

                        <button

                          type="button"

                          onClick={() => setSelectedId(item.id)}

                          className={cn(

                            'flex min-w-0 flex-1 flex-col gap-1 px-4 py-3 text-left transition-colors',

                            active ? 'bg-blue-50' : 'hover:bg-slate-50'

                          )}

                          data-testid={`crm-simplified-queue-${item.id}`}

                        >

                          <span className="font-semibold text-slate-900">{title}</span>

                          <span className="text-xs text-slate-500">

                            {STAGE_META[item.stage]?.label || item.stage}

                          </span>

                        </button>

                      </li>

                    )

                  })

                )}

              </ul>

              <div className="mt-auto shrink-0 bg-white px-2 pb-2">

                <Pagination

                  page={page}

                  totalPages={totalPages}

                  total={totalItems}

                  from={paginationFrom}

                  to={paginationTo}

                  pageSize={pageSize}

                  onPageChange={setPage}
                  compact
                  noun="prospectos"
                  testId="crm-simplified-pagination"

                />

              </div>

            </div>

          )}

        </Card>



        <Card className="p-6" data-testid="crm-simplified-detail">

          {loading && !selected ? (

            <div className="flex items-center gap-2 text-sm text-slate-500">

              <Loader2 className="h-4 w-4 animate-spin" />

              Cargando ficha…

            </div>

          ) : selected ? (

            <div className="space-y-6">

              <div className="flex flex-wrap items-start justify-between gap-3">

                <div>

                  <h3 className="font-heading text-xl font-bold text-slate-900">

                    {opportunityTitle(selected, leads)}

                  </h3>

                  <p className="mt-1 text-sm text-slate-500">

                    {selectedLead?.phone || 'Sin teléfono'}

                    {selectedLead?.email ? ` · ${selectedLead.email}` : ''}

                  </p>

                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STAGE_META[selected.stage]?.tone || 'neutral'}>
                    {STAGE_META[selected.stage]?.label || selected.stage}
                  </Badge>
                  {can.manage && selectedLead && !selectMode && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingLead(selectedLead)
                          setEditLeadOpen(true)
                        }}
                        data-testid="crm-simplified-edit-lead"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-red-600"
                        disabled={deleting || selectedLead.status === 'convertido'}
                        onClick={() => requestDeleteLead(selectedLead)}
                        data-testid="crm-simplified-delete-lead"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </Button>
                    </>
                  )}
                </div>

              </div>



              <div className="grid gap-3 sm:grid-cols-2">

                <div className="rounded-xl bg-slate-50 px-4 py-3">

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Interés</p>

                  <p className="mt-1 text-sm font-medium text-slate-800">{selected.title || '—'}</p>

                </div>

                <div className="rounded-xl bg-slate-50 px-4 py-3">

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sucursal</p>

                  <p className="mt-1 text-sm font-medium text-slate-800">

                    {branches.find((branch) => branch.id === selected.branchId)?.name || '—'}

                  </p>

                </div>

              </div>



              <div>

                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Historial reciente</p>

                {detailActivitiesLoading ? (

                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">

                    <Loader2 className="h-4 w-4 animate-spin" />

                    Cargando actividades…

                  </div>

                ) : (

                  <ul className="mt-3 space-y-2">

                    {detailActivities.length === 0 ? (

                      <li className="text-sm text-slate-500">Sin actividades registradas.</li>

                    ) : (

                      detailActivities.slice(0, 8).map((activity) => (

                        <li key={activity.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700">

                          <p className="font-medium text-slate-900">{activity.title}</p>

                          <p className="text-xs text-slate-500">

                            {ACTIVITY_TYPE_META[activity.type]?.label || activity.type}

                            {activity.dueAt ? ` · ${new Date(activity.dueAt).toLocaleString('es-DO')}` : ''}

                          </p>

                          {activity.description ? (

                            <p className="mt-1 text-xs text-slate-600">{activity.description}</p>

                          ) : null}

                        </li>

                      ))

                    )}

                  </ul>

                )}

              </div>



              <SimplifiedLeadActions

                opportunity={selected}

                lead={selectedLead}

                onActionComplete={(stage) => {

                  if (stage === 'negociacion') setStageTab('negociacion')

                  if (stage === 'cerrado' || stage === 'perdido') setSelectedId(null)

                  refreshWorkspace()

                  if (selected?.id) fetchDetailActivities(selected.id).catch(() => {})

                }}

              />

            </div>

          ) : (

            <p className="text-sm text-slate-500">Selecciona un prospecto de la cola para ver su ficha.</p>

          )}

        </Card>

      </div>



      <LeadFormModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        onSaved={() => refreshWorkspace()}
      />

      <LeadFormModal
        open={editLeadOpen}
        onClose={() => {
          setEditLeadOpen(false)
          setEditingLead(null)
        }}
        lead={editingLead}
        onSaved={() => {
          setEditLeadOpen(false)
          setEditingLead(null)
          refreshWorkspace()
        }}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => !deleting && setConfirm(null)}
        onConfirm={() => confirm?.onConfirm?.()}
        title={confirm?.title || ''}
        description={confirm?.description}
        confirmLabel="Eliminar"
        busy={deleting}
        testId="crm-simplified-confirm-delete"
      />
        </>
      )}

    </div>

  )

}


