import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, LoaderCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useIncidenciasStore } from '@/stores/incidenciasStore'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { useConfigStore } from '@/stores/configStore'
import { useActivosStore } from '@/stores/activosStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { usersApi } from '@/services/usersApi'
import { extractMentionedUserIds, plainMessagePreview } from '@/lib/mentions'
import { currentSessionActor } from '@/lib/sessionActor'
import { IncidenciaStats } from '../components/IncidenciaStats'
import { IncidenciaList } from '../components/IncidenciaList'
import { IncidenciaDetail } from '../components/IncidenciaDetail'
import { IncidenciaFormModal } from '../components/IncidenciaFormModal'

export default function IncidenciasPage() {
  const incidencias = useIncidenciasStore((s) => s.incidencias)
  const selectedId = useIncidenciasStore((s) => s.selectedId)
  const setSelectedId = useIncidenciasStore((s) => s.setSelectedId)
  const getStats = useIncidenciasStore((s) => s.getStats)
  const addIncidencia = useIncidenciasStore((s) => s.addIncidencia)
  const updateStatus = useIncidenciasStore((s) => s.updateStatus)
  const addComment = useIncidenciasStore((s) => s.addComment)
  const addImages = useIncidenciasStore((s) => s.addImages)
  const hydrateFromApi = useIncidenciasStore((s) => s.hydrateFromApi)
  const hydrating = useIncidenciasStore((s) => s.hydrating)
  const error = useIncidenciasStore((s) => s.error)
  const addMentionNotifications = useNotificationsStore((s) => s.addMentionNotifications)

  const [searchParams] = useSearchParams()

  const branches = useConfigStore((s) => s.branches)
  const localUsers = useConfigStore((s) => s.users)
  const activos = useActivosStore((s) => s.activos)
  const employees = useRrhhStore((s) => s.employees)
  const hydrateEmployees = useRrhhStore((s) => s.hydrateEmployees)
  const hydrateAssets = useActivosStore((s) => s.hydrateFromApi)
  const isOnline = useSessionStore((s) => s.isOnline())
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated())
  const canCreate = useSessionStore((s) => s.hasPermission('incidents.create'))
  const canManage = useSessionStore((s) => s.hasPermission('incidents.manage'))
  const canReadMemberships = useSessionStore((s) => s.hasPermission('membership.read'))
  const sessionUser = useSessionStore((s) => s.user)

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [quickFilter, setQuickFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [apiUsers, setApiUsers] = useState([])

  useEffect(() => {
    if (!isOnline || !isAuthenticated) {
      setApiUsers([])
      return undefined
    }

    let cancelled = false
    const requests = [
      hydrateFromApi().catch(() => null),
      hydrateAssets().catch(() => null),
      hydrateEmployees().catch(() => null),
    ]
    if (canReadMemberships) {
      requests.push(
        usersApi.list({ status: 'active', pageSize: 100, sortBy: 'displayName' })
          .then((response) => {
            if (cancelled) return
            setApiUsers((response.items || []).map((user) => ({
              id: user.id,
              name: user.displayName,
              email: user.email,
              active: user.status === 'active',
            })))
          })
          .catch(() => {
            if (!cancelled) setApiUsers([])
          })
      )
    }
    Promise.all(requests)
    return () => {
      cancelled = true
    }
  }, [
    isOnline,
    isAuthenticated,
    canReadMemberships,
    hydrateFromApi,
    hydrateAssets,
    hydrateEmployees,
  ])

  useEffect(() => {
    const incId = searchParams.get('inc')
    if (incId) setSelectedId(incId)
  }, [searchParams, setSelectedId])

  const users = useMemo(() => {
    if (!isOnline) return localUsers
    const current = sessionUser?.membershipId
      ? [{
        id: sessionUser.membershipId,
        name: sessionUser.name,
        email: sessionUser.email,
        active: true,
      }]
      : []
    return Array.from(
      new Map([...current, ...apiUsers].map((user) => [user.id, user])).values()
    )
  }, [isOnline, localUsers, apiUsers, sessionUser?.membershipId, sessionUser?.name, sessionUser?.email])

  const handleComment = async (id, author, message) => {
    await addComment(id, author, message, { isOnline })
    const item = incidencias.find((i) => i.id === id)
    if (!item) return
    const userIds = extractMentionedUserIds(message)
    if (!userIds.length) return
    addMentionNotifications({
      authorId: currentSessionActor().id,
      authorName: author,
      userIds,
      incidenciaId: id,
      incidenciaCode: item.code,
      messagePreview: plainMessagePreview(message),
    })
    const names = userIds
      .map((uid) => users.find((u) => u.id === uid)?.name)
      .filter(Boolean)
    if (names.length) toast.success(`Notificación enviada a ${names.join(', ')}`)
  }

  const handleCreate = (data) => addIncidencia(data, { isOnline })
  const handleStatusChange = (id, status, author) =>
    updateStatus(id, status, author, { isOnline })
  const handleAddImages = (id, files) => addImages(id, files, { isOnline })

  const branchOptions = useMemo(
    () => [{ value: 'all', label: 'Todas las sucursales' }, ...branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))],
    [branches]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return incidencias.filter((i) => {
      if (quickFilter === 'abierta' && i.status !== 'abierta') return false
      if (quickFilter === 'en_proceso' && i.status !== 'en_proceso') return false
      if (quickFilter === 'critica' && !(i.priority === 'critica' && i.status !== 'cerrada')) return false
      if (typeFilter !== 'all' && i.type !== typeFilter) return false
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (branchFilter !== 'all' && i.branchId !== branchFilter) return false
      const day = i.createdAt?.slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      if (!q) return true
      return (
        i.code.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
      )
    })
  }, [incidencias, query, typeFilter, statusFilter, quickFilter, branchFilter, dateFrom, dateTo])

  const stats = useMemo(() => getStats(), [incidencias, getStats])

  const selected = useMemo(
    () => incidencias.find((i) => i.id === selectedId) || filtered[0] || null,
    [incidencias, selectedId, filtered]
  )

  const branchName = selected?.branchId
    ? branches.find((b) => b.id === selected.branchId)?.name
    : null
  const activoName = selected?.activoId
    ? activos.find((a) => a.id === selected.activoId)?.name
    : null

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="incidencias-page">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button
          onClick={() => setModalOpen(true)}
          disabled={!canCreate || hydrating}
          data-testid="incidencias-new-btn"
        >
          <Plus className="h-4 w-4" />
          Nueva Incidencia
        </Button>
      </div>

      {hydrating && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Cargando incidencias desde la API…
        </div>
      )}

      {error && isOnline && !hydrating && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => hydrateFromApi({ force: true }).catch(() => {})}
          >
            Reintentar
          </Button>
        </div>
      )}

      <IncidenciaStats stats={stats} activeFilter={quickFilter} onFilter={setQuickFilter} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <IncidenciaList
            items={filtered}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            query={query}
            onQueryChange={setQuery}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            branchFilter={branchFilter}
            onBranchFilterChange={setBranchFilter}
            branchOptions={branchOptions}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
        </div>
        <div className="lg:col-span-2">
          <IncidenciaDetail
            item={selected}
            branchName={branchName}
            activoName={activoName}
            onStatusChange={handleStatusChange}
            onComment={handleComment}
            onAddImages={handleAddImages}
            canManage={canManage}
          />
        </div>
      </div>

      <IncidenciaFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
        branches={branches}
        users={users}
        activos={activos}
        employees={employees}
        canAttach={canManage}
      />
    </div>
  )
}
