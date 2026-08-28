import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Info } from 'lucide-react'
import { useFinanzasStore, catName } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { PasivoFormModal } from '../components/PasivoFormModal'
import { CreditCard } from 'lucide-react'

export default function PasivosPage() {
  const pasivos = useFinanzasStore((s) => s.pasivos)
  const deletePasivo = useFinanzasStore((s) => s.deletePasivo)
  const getPasivoStats = useFinanzasStore((s) => s.getPasivoStats)
  const branches = useConfigStore((s) => s.branches)

  const [branchFilter, setBranchFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const branchOptions = [{ value: 'all', label: 'Todas las sucursales' }, ...branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]
  const stats = useMemo(() => getPasivoStats(), [pasivos, getPasivoStats])

  const list = useMemo(
    () => pasivos.filter((p) => branchFilter === 'all' || p.branchId === branchFilter),
    [pasivos, branchFilter]
  )

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="pasivos-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={branchFilter} onChange={setBranchFilter} options={branchOptions} className="w-56" menuMinWidth={200} />
        <Button onClick={() => { setEditing(null); setModalOpen(true) }} data-testid="pasivos-new-btn">
          <Plus className="h-4 w-4" /> Nuevo Pasivo
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Deuda Total</p><p className="mt-1 font-heading text-2xl font-bold text-red-600">{formatDOP(stats.deudaTotal)}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Tarjetas Activas</p><p className="mt-1 font-heading text-2xl font-bold text-slate-900">{stats.tarjetas}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Préstamos</p><p className="mt-1 font-heading text-2xl font-bold text-slate-900">{stats.prestamos}</p></Card>
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={CreditCard} title="Sin pasivos" description="Registra préstamos o tarjetas de crédito." className="py-12" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-4">Nombre</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4 text-right">M. Inicial</th>
                  <th className="px-6 py-4 text-right">M. Pendiente</th>
                  <th className="px-6 py-4">Categorías Asoc.</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {list.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60" data-testid={`pasivo-row-${p.id}`}>
                    <td className="px-6 py-4 font-semibold text-slate-800">{p.name}</td>
                    <td className="px-6 py-4">
                      <Badge tone={p.type === 'prestamo' ? 'brand' : 'warning'}>{p.type}</Badge>
                      {p.type === 'prestamo' && p.installment && (
                        <p className="mt-1 text-xs text-slate-400">Cuota {formatDOP(p.installment)} · Pago día {p.payDay}</p>
                      )}
                      {p.type === 'prestamo' && p.totalInstallments && (
                        <p className="text-xs text-slate-400">{p.paidInstallments || 0} / {p.totalInstallments} cuotas</p>
                      )}
                      {p.type === 'tarjeta' && (
                        <p className="mt-1 text-xs text-slate-400">Límite día {p.payDay} · Corte día {p.cutDay}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-slate-600">{formatDOP(p.initialAmount)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-bold text-red-500">{formatDOP(p.pendingAmount)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(p.categoryIds || []).map((c) => (
                          <Badge key={c} tone="neutral">{catName(c)}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(p); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => { deletePasivo(p.id); toast.success('Pasivo eliminado') }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p><strong>Consejo:</strong> Al registrar un gasto en Finanzas, si la categoría coincide con las asociadas a un pasivo, el sistema permite descontar el monto automáticamente de la deuda pendiente.</p>
      </div>

      <PasivoFormModal open={modalOpen} onClose={() => setModalOpen(false)} pasivo={editing} />
    </div>
  )
}
