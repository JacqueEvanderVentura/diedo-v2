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
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardFooter,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { PasivoFormModal } from '../components/PasivoFormModal'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { CreditCard } from 'lucide-react'

export default function PasivosPage() {
  const pasivos = useFinanzasStore((s) => s.pasivos)
  const deletePasivo = useFinanzasStore((s) => s.deletePasivo)
  const getPasivoStats = useFinanzasStore((s) => s.getPasivoStats)
  const branches = useConfigStore((s) => s.branches)

  const [branchFilter, setBranchFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const branchOptions = [{ value: 'all', label: 'Todas las sucursales' }, ...branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))]
  const stats = useMemo(() => getPasivoStats(), [pasivos, getPasivoStats])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pasivos
      .filter((p) => branchFilter === 'all' || p.branchId === branchFilter)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.type?.toLowerCase().includes(q))
  }, [pasivos, branchFilter, query])

  const { rows: list, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'name', dir: 'asc' },
    accessors: {
      name: (p) => p.name || '',
      type: (p) => p.type || '',
      initialAmount: (p) => p.initialAmount || 0,
      pendingAmount: (p) => p.pendingAmount || 0,
      categories: (p) => (p.categoryIds || []).length,
    },
  })

  const remove = async (id) => {
    try {
      await deletePasivo(id)
      toast.success('Pasivo eliminado')
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar el pasivo')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="pasivos-page">
      <DataFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Buscar pasivo..."
        filters={[
          {
            id: 'branch',
            label: 'Sucursal',
            value: branchFilter,
            onChange: setBranchFilter,
            options: branchOptions,
          },
        ]}
        testId="pasivos-filters"
      />

      <div className="flex justify-end">
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
          <ResponsiveList minTableWidth={900} columnCount={6}>
            <ResponsiveTable testId="pasivos-table" wrapCard={false}>
              <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <SortableTh column="name" className="px-6 py-4">Nombre</SortableTh>
                    <SortableTh column="type" className="px-6 py-4">Tipo</SortableTh>
                    <SortableTh column="initialAmount" align="right" className="px-6 py-4">M. Inicial</SortableTh>
                    <SortableTh column="pendingAmount" align="right" className="px-6 py-4">M. Pendiente</SortableTh>
                    <SortableTh column="categories" className="px-6 py-4">Categorías Asoc.</SortableTh>
                    <SortableTh sortable={false} align="right" className="px-6 py-4">Acciones</SortableTh>
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
                          <button onClick={() => remove(p.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </SortableTableProvider>
            </ResponsiveTable>
            <ResponsiveCards testId="pasivos-cards" className="p-4">
              {list.map((p) => (
                <MobileCard key={p.id} testId={`pasivo-card-${p.id}`}>
                  <MobileCardHeader
                    title={p.name}
                    badge={<Badge tone={p.type === 'prestamo' ? 'brand' : 'warning'}>{p.type}</Badge>}
                    actions={
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(p); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(p.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    }
                  />
                  {p.type === 'prestamo' && p.installment && (
                    <p className="mt-1 text-xs text-slate-400">Cuota {formatDOP(p.installment)} · Pago día {p.payDay}</p>
                  )}
                  {p.type === 'tarjeta' && (
                    <p className="mt-1 text-xs text-slate-400">Límite día {p.payDay} · Corte día {p.cutDay}</p>
                  )}
                  <MobileCardGrid className="mt-3">
                    <MobileField label="M. inicial">{formatDOP(p.initialAmount)}</MobileField>
                    <MobileField label="M. pendiente">
                      <span className="font-bold text-red-500">{formatDOP(p.pendingAmount)}</span>
                    </MobileField>
                    <MobileField label="Categorías" fullWidth>
                      <div className="flex flex-wrap gap-1">
                        {(p.categoryIds || []).map((c) => (
                          <Badge key={c} tone="neutral">{catName(c)}</Badge>
                        ))}
                      </div>
                    </MobileField>
                  </MobileCardGrid>
                </MobileCard>
              ))}
            </ResponsiveCards>
          </ResponsiveList>
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
