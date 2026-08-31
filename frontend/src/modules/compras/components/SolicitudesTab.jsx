import { useMemo, useState } from 'react'
import { Plus, Search, FileText, CheckCircle, Package, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { useComprasStore, requestTotal } from '@/stores/comprasStore'
import { useConfigStore } from '@/stores/configStore'
import { REQUEST_STATUS_META } from '@/data/compras'
import { formatDOP } from '@/lib/format'
import { buildBranchFilterOptions } from '@/lib/branches'
import { Select } from '@/components/ui/Select'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
}
import { PurchaseRequestModal } from './PurchaseRequestModal'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { cn } from '@/lib/utils'
import { currentSessionActor } from '@/lib/sessionActor'
import { useSessionStore } from '@/stores/sessionStore'

const toneClass = {
  warning: 'bg-amber-100 text-amber-700',
  brand: 'bg-blue-100 text-blue-700',
  success: 'bg-emerald-100 text-emerald-700',
  danger: 'bg-red-100 text-red-700',
}

function KpiCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className={cn('rounded-lg p-2', tone)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

export function SolicitudesTab() {
  const suppliers = useComprasStore((s) => s.suppliers)
  const purchaseRequests = useComprasStore((s) => s.purchaseRequests)
  const addPurchaseRequest = useComprasStore((s) => s.addPurchaseRequest)
  const reviewPurchaseRequest = useComprasStore((s) => s.reviewPurchaseRequest)
  const markRequestDelivered = useComprasStore((s) => s.markRequestDelivered)
  const getRequestStats = useComprasStore((s) => s.getRequestStats)
  const branches = useConfigStore((s) => s.branches)
  const isOnline = useSessionStore((s) => s.isOnline())

  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [busyAction, setBusyAction] = useState(null)

  const stats = getRequestStats()

  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || '—'

  const filteredRaw = useMemo(() => {
    const q = search.trim().toLowerCase()
    return purchaseRequests.filter((r) => {
      if (branchFilter !== 'all' && r.branchId !== branchFilter) return false
      if (!q) return true
      return (
        r.id.toLowerCase().includes(q) ||
        r.number?.toLowerCase().includes(q) ||
        r.requesterName?.toLowerCase().includes(q) ||
        supplierName(r.supplierId).toLowerCase().includes(q)
      )
    })
  }, [purchaseRequests, search, suppliers, branchFilter])

  const { rows: filtered, sortKey, sortDir, toggleSort } = useSortedRows(filteredRaw, {
    defaultSort: { key: 'date', dir: 'desc' },
    accessors: {
      date: (r) => new Date(r.createdAt),
      supplier: (r) => supplierName(r.supplierId),
      requester: (r) => r.requesterName || '',
      total: (r) => requestTotal(r),
      quote: (r) => r.quoteFile ? 1 : 0,
      status: (r) => r.status || '',
    },
  })

  const selected = purchaseRequests.find((r) => r.id === selectedId) || filtered[0] || null

  const handleApprove = async (id) => {
    setBusyAction(`approve:${id}`)
    try {
      await reviewPurchaseRequest(id, 'aprobada', currentSessionActor().id, { isOnline })
      toast.success('Solicitud aprobada')
    } catch (error) {
      toast.error(error.message || 'No se pudo aprobar la solicitud')
    } finally {
      setBusyAction(null)
    }
  }

  const handleReject = async (id) => {
    setBusyAction(`reject:${id}`)
    try {
      await reviewPurchaseRequest(id, 'rechazada', currentSessionActor().id, { isOnline })
      toast.success('Solicitud rechazada')
    } catch (error) {
      toast.error(error.message || 'No se pudo rechazar la solicitud')
    } finally {
      setBusyAction(null)
    }
  }

  const handleDeliver = async (id) => {
    setBusyAction(`deliver:${id}`)
    try {
      await markRequestDelivered(id, { isOnline })
      toast.success('Marcada como entregada')
    } catch (error) {
      toast.error(error.message || 'No se pudo marcar la solicitud como entregada')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total" value={stats.total} icon={FileText} tone="bg-slate-100 text-slate-600" />
        <KpiCard label="Pendientes" value={stats.pendiente} icon={Clock} tone="bg-amber-100 text-amber-600" />
        <KpiCard label="Aprobadas" value={stats.aprobada} icon={CheckCircle} tone="bg-blue-100 text-blue-600" />
        <KpiCard label="Entregadas" value={stats.entregada} icon={Package} tone="bg-emerald-100 text-emerald-600" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(280px,1fr)_220px] lg:max-w-3xl">
          <Input
            icon={Search}
            placeholder="Buscar por número, proveedor o solicitante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            value={branchFilter}
            onChange={setBranchFilter}
            options={buildBranchFilterOptions(branches)}
            size="md"
            data-testid="solicitudes-branch-filter"
          />
        </div>
        <Button className="w-full shrink-0 sm:w-auto" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva Solicitud
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <EmptyState icon={FileText} title="Sin solicitudes" description="No hay solicitudes de compra." className="py-12" />
          ) : (
            <ResponsiveList columnCount={6}>
              <ResponsiveTable testId="solicitudes-table" wrapCard={false}>
                <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <SortableTh column="date" className="px-4 py-3">ID / Fecha</SortableTh>
                      <SortableTh column="supplier" className="px-4 py-3">Proveedor</SortableTh>
                      <SortableTh column="requester" className="px-4 py-3">Solicitado por</SortableTh>
                      <SortableTh column="total" className="px-4 py-3">Monto Total</SortableTh>
                      <SortableTh column="quote" align="center" className="px-4 py-3">Cotización</SortableTh>
                      <SortableTh column="status" align="right" className="px-4 py-3">Estado</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((req) => {
                      const meta = REQUEST_STATUS_META[req.status] || REQUEST_STATUS_META.pendiente
                      return (
                        <tr
                          key={req.id}
                          onClick={() => setSelectedId(req.id)}
                          className={cn(
                            'cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50',
                            selected?.id === req.id && 'bg-blue-50/60'
                          )}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{req.number || req.id}</p>
                            <p className="text-xs text-slate-400">{formatDate(req.createdAt)}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{supplierName(req.supplierId)}</td>
                          <td className="px-4 py-3 text-slate-600">{req.requesterName}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{formatDOP(requestTotal(req))}</td>
                          <td className="px-4 py-3 text-center">
                            {req.quoteFile ? (
                              <span className="text-xs text-blue-600">{req.quoteFile.name}</span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', toneClass[meta.tone])}>
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </SortableTableProvider>
              </ResponsiveTable>
              <ResponsiveCards testId="solicitudes-cards" className="p-4">
                {filtered.map((req) => {
                  const meta = REQUEST_STATUS_META[req.status] || REQUEST_STATUS_META.pendiente
                  return (
                    <MobileCard
                      key={req.id}
                      onClick={() => setSelectedId(req.id)}
                      testId={`solicitudes-card-${req.id}`}
                      className={selected?.id === req.id ? 'ring-2 ring-blue-200' : undefined}
                    >
                      <MobileCardHeader
                        title={req.number || req.id}
                        subtitle={formatDate(req.createdAt)}
                        badge={
                          <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', toneClass[meta.tone])}>
                            {meta.label}
                          </span>
                        }
                      />
                      <MobileCardGrid>
                        <MobileField label="Proveedor">{supplierName(req.supplierId)}</MobileField>
                        <MobileField label="Solicitado por">{req.requesterName}</MobileField>
                        <MobileField label="Monto">
                          <span className="font-medium text-slate-800">{formatDOP(requestTotal(req))}</span>
                        </MobileField>
                        <MobileField label="Cotización">
                          {req.quoteFile ? req.quoteFile.name : '—'}
                        </MobileField>
                      </MobileCardGrid>
                    </MobileCard>
                  )
                })}
              </ResponsiveCards>
            </ResponsiveList>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{selected.number || selected.id}</h3>
                <p className="text-sm text-slate-500">{supplierName(selected.supplierId)} · {formatDate(selected.createdAt)}</p>
              </div>
              {selected.notes && <p className="text-sm text-slate-600">{selected.notes}</p>}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Artículos</p>
                <ul className="space-y-1 text-sm text-slate-700">
                  {(selected.items || []).map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{item.name} × {item.qty} {item.unit}</span>
                      <span>{formatDOP((item.qty || 0) * (item.price || 0))}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t pt-2 text-right font-semibold text-slate-900">
                  Total: {formatDOP(requestTotal(selected))}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.status === 'pendiente' && (
                  <>
                    <Button size="sm" disabled={Boolean(busyAction)} onClick={() => handleApprove(selected.id)}>
                      {busyAction === `approve:${selected.id}` ? 'Aprobando…' : 'Aprobar'}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={Boolean(busyAction)} onClick={() => handleReject(selected.id)}>
                      {busyAction === `reject:${selected.id}` ? 'Rechazando…' : 'Rechazar'}
                    </Button>
                  </>
                )}
                {selected.status === 'aprobada' && (
                  <Button size="sm" disabled={Boolean(busyAction)} onClick={() => handleDeliver(selected.id)}>
                    {busyAction === `deliver:${selected.id}` ? 'Guardando…' : 'Marcar entregada'}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Selecciona una solicitud para ver el detalle.</p>
          )}
        </div>
      </div>

      <PurchaseRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={(data) => addPurchaseRequest(data, { isOnline })}
      />
    </div>
  )
}
