import { useMemo, useState } from 'react'
import { Plus, Search, FileText, CheckCircle, Package, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useComprasStore, requestTotal } from '@/stores/comprasStore'
import { REQUEST_STATUS_META } from '@/data/compras'
import { formatDOP } from '@/lib/format'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
}
import { PurchaseRequestModal } from './PurchaseRequestModal'
import { cn } from '@/lib/utils'

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

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  const stats = getRequestStats()

  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || '—'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return purchaseRequests
    return purchaseRequests.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.requesterName?.toLowerCase().includes(q) ||
        supplierName(r.supplierId).toLowerCase().includes(q)
    )
  }, [purchaseRequests, search, suppliers])

  const selected = purchaseRequests.find((r) => r.id === selectedId) || filtered[0] || null

  const handleApprove = (id) => {
    reviewPurchaseRequest(id, 'aprobada', 'u1')
    toast.success('Solicitud aprobada')
  }

  const handleReject = (id) => {
    reviewPurchaseRequest(id, 'rechazada', 'u1')
    toast.success('Solicitud rechazada')
  }

  const handleDeliver = (id) => {
    markRequestDelivered(id)
    toast.success('Marcada como entregada')
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total" value={stats.total} icon={FileText} tone="bg-slate-100 text-slate-600" />
        <KpiCard label="Pendientes" value={stats.pendiente} icon={Clock} tone="bg-amber-100 text-amber-600" />
        <KpiCard label="Aprobadas" value={stats.aprobada} icon={CheckCircle} tone="bg-blue-100 text-blue-600" />
        <KpiCard label="Entregadas" value={stats.entregada} icon={Package} tone="bg-emerald-100 text-emerald-600" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar solicitud..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Nueva Solicitud</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">ID / Fecha</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Solicitado por</th>
                <th className="px-4 py-3">Monto Total</th>
                <th className="px-4 py-3 text-center">Cotización</th>
                <th className="px-4 py-3 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <FileText className="mx-auto mb-2 h-10 w-10 opacity-40" />
                    No hay solicitudes de compra.
                  </td>
                </tr>
              ) : (
                filtered.map((req) => {
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
                        <p className="font-medium text-slate-800">{req.id}</p>
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
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{selected.id}</h3>
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
                    <Button size="sm" onClick={() => handleApprove(selected.id)}>Aprobar</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleReject(selected.id)}>Rechazar</Button>
                  </>
                )}
                {selected.status === 'aprobada' && (
                  <Button size="sm" onClick={() => handleDeliver(selected.id)}>Marcar entregada</Button>
                )}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Selecciona una solicitud para ver el detalle.</p>
          )}
        </div>
      </div>

      <PurchaseRequestModal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={addPurchaseRequest} />
    </div>
  )
}
