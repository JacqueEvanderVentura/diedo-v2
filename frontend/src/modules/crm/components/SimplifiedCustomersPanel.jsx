import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Phone, Search, Trash2, CheckSquare, Square } from 'lucide-react'
import { useCustomersStore } from '@/stores/customersStore'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useCrmCapabilities } from '@/modules/crm/hooks/useCrmCapabilities'
import { customersVisibleToSession } from '@/lib/customerScope'
import { matchesBranches } from '@/lib/branches'
import { nextSelectAllState } from '@/lib/listSelection'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { BulkSelectionBar } from '@/components/ui/BulkSelectionBar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CustomerFormModal } from '@/modules/crm/components/CustomerFormModal'
import { CustomerDetailModal } from '@/modules/crm/components/CustomerDetailModal'
import { cn } from '@/lib/utils'
import { Pagination } from '@/modules/reportes/components/Pagination'
import { CRM_PAGE_SIZE_OPTIONS, DEFAULT_CRM_PAGE_SIZE } from '@/modules/crm/constants/paging'

export function SimplifiedCustomersPanel() {
  const can = useCrmCapabilities()
  const online = useSessionStore((s) => s.status === 'online')
  const sessionUser = useSessionStore((s) => s.user)
  const customers = useCustomersStore((s) => s.customers)
  const customersListMeta = useCustomersStore((s) => s.customersListMeta)
  const fetchCustomersPage = useCustomersStore((s) => s.fetchCustomersPage)
  const setCustomersPage = useCustomersStore((s) => s.setCustomersPage)
  const setCustomersPageSize = useCustomersStore((s) => s.setCustomersPageSize)
  const deleteCustomers = useCustomersStore((s) => s.deleteCustomers)
  const branches = useConfigStore((s) => s.branches)

  const [query, setQuery] = useState('')
  const [branchIds, setBranchIds] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)

  useEffect(() => {
    if (!online) return undefined
    const handle = window.setTimeout(() => {
      fetchCustomersPage({ page: 1, search: query.trim(), branchIds }).catch(() => {})
    }, query.trim() ? 400 : 0)
    return () => window.clearTimeout(handle)
  }, [online, query, branchIds, fetchCustomersPage])

  const scoped = useMemo(
    () => customersVisibleToSession(customers, sessionUser).filter((c) => c.id !== 'walk-in'),
    [customers, sessionUser],
  )

  const filtered = useMemo(() => (
    online
      ? scoped.filter((c) => (branchIds.length > 1 ? matchesBranches(c, branchIds) : true))
      : scoped
        .filter((c) => matchesBranches(c, branchIds))
        .filter((c) => {
          const q = query.trim().toLowerCase()
          return !q || [c.name, c.phone, c.email, c.documentId].some((f) => f && `${f}`.toLowerCase().includes(q))
        })
  ), [scoped, query, branchIds, online])

  const selected = filtered.find((c) => c.id === selectedId) || null
  const selectableIds = useMemo(() => filtered.map((c) => c.id), [filtered])
  const paginationMeta = {
    page: customersListMeta.page || 1,
    totalPages: Math.max(1, customersListMeta.totalPages || 1),
    total: customersListMeta.totalItems || 0,
    pageSize: customersListMeta.pageSize || DEFAULT_CRM_PAGE_SIZE,
    from: customersListMeta.totalItems === 0 ? 0 : ((customersListMeta.page - 1) * customersListMeta.pageSize) + 1,
    to: Math.min(customersListMeta.page * customersListMeta.pageSize, customersListMeta.totalItems),
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runDelete = async (ids) => {
    setDeleting(true)
    try {
      const chunks = []
      for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
      let deleted = 0
      let errors = 0
      for (const chunk of chunks) {
        const result = await deleteCustomers(chunk)
        for (const row of result.items || []) {
          if (row.status === 'deleted') deleted += 1
          else errors += 1
        }
      }
      if (deleted) toast.success(`${deleted} cliente(s) eliminados`)
      if (errors) toast.error(`${errors} no se pudieron eliminar.`)
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
      exitSelectMode()
    } catch (error) {
      toast.error(error.message || 'No se pudo completar la eliminación')
    } finally {
      setDeleting(false)
      setConfirm(null)
    }
  }

  const openEdit = (customer) => {
    setEditing(customer)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4" data-testid="crm-simplified-customers">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-9"
            data-testid="crm-simplified-customers-search"
          />
        </div>
        <BranchMultiSelect branches={branches} branchIds={branchIds} onChange={setBranchIds} className="w-full sm:max-w-xs" />
        {can.customer && (
          <Button
            type="button"
            variant={selectMode ? 'secondary' : 'ghost'}
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            data-testid="crm-simplified-customers-select-mode"
          >
            {selectMode ? 'Cancelar selección' : 'Seleccionar'}
          </Button>
        )}
      </div>

      {selectMode && can.customer && (
        <BulkSelectionBar
          selectedCount={selectedIds.size}
          totalSelectable={selectableIds.length}
          onSelectAll={() => setSelectedIds(nextSelectAllState(selectedIds, selectableIds))}
          onDelete={() => {
            const ids = [...selectedIds]
            if (!ids.length) return
            setConfirm({
              title: 'Eliminar clientes',
              description: `¿Eliminar ${ids.length} cliente(s)? Se archivarán del directorio.`,
              onConfirm: () => runDelete(ids),
            })
          }}
          deleting={deleting}
          testId="crm-simplified-customers-bulk"
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr] lg:items-stretch">
        <Card className="flex min-h-[min(28rem,65vh)] flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Clientes</p>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-slate-50 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-slate-500">Sin clientes con esos filtros.</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id} className="flex items-stretch">
                  {selectMode && can.customer && (
                    <button
                      type="button"
                      className="px-3 text-slate-500 hover:text-blue-600"
                      onClick={() => toggleSelected(c.id)}
                      aria-label={selectedIds.has(c.id) ? 'Quitar selección' : 'Seleccionar cliente'}
                    >
                      {selectedIds.has(c.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      'flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 text-left transition-colors',
                      selectedId === c.id ? 'bg-blue-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <span className="truncate font-semibold text-slate-900">{c.name}</span>
                    {c.phone && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="p-6">
          {selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-heading text-xl font-bold text-slate-900">{selected.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{selected.phone || 'Sin teléfono'}</p>
                </div>
                {can.customer && !selectMode && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(selected)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-red-600"
                      disabled={deleting}
                      onClick={() => setConfirm({
                        title: 'Eliminar cliente',
                        description: `¿Eliminar a "${selected.name}"? Se archivará del directorio.`,
                        onConfirm: () => runDelete([selected.id]),
                      })}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </Button>
                  </div>
                )}
              </div>
              <Button size="sm" variant="secondary" onClick={() => setDetailOpen(true)}>
                Ver ficha completa
              </Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Selecciona un cliente de la lista.</p>
          )}
        </Card>
      </div>

      {online && (filtered.length > 0 || paginationMeta.total > 0) && (
        <Card className="p-4">
          <Pagination
            page={paginationMeta.page}
            totalPages={paginationMeta.totalPages}
            total={paginationMeta.total}
            from={paginationMeta.from}
            to={paginationMeta.to}
            pageSize={paginationMeta.pageSize}
            pageSizeOptions={CRM_PAGE_SIZE_OPTIONS}
            onPageChange={(page) => setCustomersPage(page).catch(() => {})}
            onPageSizeChange={(size) => setCustomersPageSize(size).catch(() => {})}
            noun="clientes"
            testId="crm-simplified-customers-pagination"
            compact
          />
        </Card>
      )}

      <CustomerDetailModal
        open={detailOpen && !!selected}
        onClose={() => setDetailOpen(false)}
        customer={selected}
        onEdit={(c) => {
          setDetailOpen(false)
          openEdit(c)
        }}
        onDelete={can.customer ? (c) => setConfirm({
          title: 'Eliminar cliente',
          description: `¿Eliminar a "${c.name}"? Se archivará del directorio.`,
          onConfirm: () => runDelete([c.id]),
        }) : undefined}
      />

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} customer={editing} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => !deleting && setConfirm(null)}
        onConfirm={() => confirm?.onConfirm?.()}
        title={confirm?.title || ''}
        description={confirm?.description}
        confirmLabel="Eliminar"
        busy={deleting}
        testId="crm-simplified-customers-confirm"
      />
    </div>
  )
}
