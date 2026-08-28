import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useIncidenciasStore } from '@/stores/incidenciasStore'
import { useConfigStore } from '@/stores/configStore'
import { useActivosStore } from '@/stores/activosStore'
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

  const branches = useConfigStore((s) => s.branches)
  const activos = useActivosStore((s) => s.activos)

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [quickFilter, setQuickFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)

  const stats = useMemo(() => getStats(), [incidencias, getStats])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return incidencias.filter((i) => {
      if (quickFilter === 'abierta' && i.status !== 'abierta') return false
      if (quickFilter === 'en_proceso' && i.status !== 'en_proceso') return false
      if (quickFilter === 'critica' && !(i.priority === 'critica' && i.status !== 'cerrada')) return false
      if (typeFilter !== 'all' && i.type !== typeFilter) return false
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (!q) return true
      return (
        i.code.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
      )
    })
  }, [incidencias, query, typeFilter, statusFilter, quickFilter])

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
        <Button onClick={() => setModalOpen(true)} data-testid="incidencias-new-btn">
          <Plus className="h-4 w-4" />
          Nueva Incidencia
        </Button>
      </div>

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
          />
        </div>
        <div className="lg:col-span-2">
          <IncidenciaDetail
            item={selected}
            branchName={branchName}
            activoName={activoName}
            onStatusChange={updateStatus}
            onComment={addComment}
            onAddImages={addImages}
          />
        </div>
      </div>

      <IncidenciaFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={addIncidencia} />
    </div>
  )
}
