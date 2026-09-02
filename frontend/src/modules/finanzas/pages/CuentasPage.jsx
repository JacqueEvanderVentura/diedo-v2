import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Search, PiggyBank } from 'lucide-react'
import { useFinanzasStore } from '@/stores/finanzasStore'
import { useConfigStore } from '@/stores/configStore'
import { formatDOP } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { AccountFormModal } from '../components/AccountFormModal'
import { ACCOUNT_TYPES } from '@/stores/finanzasStore'

export default function CuentasPage() {
  const accounts = useFinanzasStore((s) => s.accounts)
  const deleteAccount = useFinanzasStore((s) => s.deleteAccount)
  const getAccountStats = useFinanzasStore((s) => s.getAccountStats)
  const branches = useConfigStore((s) => s.branches)

  const [branchFilter, setBranchFilter] = useState('charm-dn')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const branchOptions = branches.filter((b) => b.active).map((b) => ({ value: b.id, label: b.name }))
  const stats = useMemo(() => getAccountStats(), [accounts, getAccountStats])
  const typeName = (id) => ACCOUNT_TYPES.find((t) => t.id === id)?.name || id

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return accounts
      .filter((a) => a.branchId === branchFilter)
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.bank?.toLowerCase().includes(q))
  }, [accounts, branchFilter, query])

  useEffect(() => {
    if (branchOptions.length && !branchOptions.some((option) => option.value === branchFilter)) {
      setBranchFilter(branchOptions[0].value)
    }
  }, [branchFilter, branchOptions])

  const remove = async (id) => {
    try {
      await deleteAccount(id)
      toast.success('Cuenta eliminada')
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar la cuenta')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="cuentas-page">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Total General</p><p className="mt-1 font-heading text-2xl font-bold">RD$ {formatDOP(stats.total).replace('RD$ ', '')}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Bancos</p><p className="mt-1 font-heading text-2xl font-bold">RD$ {formatDOP(stats.banco).replace('RD$ ', '')}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Inversión</p><p className="mt-1 font-heading text-2xl font-bold">RD$ {formatDOP(stats.inversion).replace('RD$ ', '')}</p></Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Accionistas</p><p className="mt-1 font-heading text-2xl font-bold">RD$ {formatDOP(stats.accionistas).replace('RD$ ', '')}</p></Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cuenta..." className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600" />
          </div>
          <Select value={branchFilter} onChange={setBranchFilter} options={branchOptions} className="w-48" menuMinWidth={180} />
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true) }} data-testid="cuentas-new-btn"><Plus className="h-4 w-4" /> Nueva Cuenta</Button>
      </div>

      {list.length === 0 ? (
        <Card><EmptyState icon={PiggyBank} title="No se encontraron cuentas" description="Crea tu primera cuenta bancaria o de inversión para comenzar." className="py-16" /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <Card key={a.id} className="p-5" data-testid={`cuenta-card-${a.id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <Badge tone="brand">{typeName(a.type)}</Badge>
                  <h4 className="mt-2 font-heading font-bold text-slate-900">{a.name}</h4>
                  <p className="text-sm text-slate-500">{a.bank} · {a.accountNumber}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(a); setModalOpen(true) }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(a.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <p className="mt-4 font-heading text-2xl font-bold text-slate-900">RD$ {formatDOP(a.balance).replace('RD$ ', '')}</p>
              {a.notes && <p className="mt-2 text-xs text-slate-400">{a.notes}</p>}
            </Card>
          ))}
        </div>
      )}

      <AccountFormModal open={modalOpen} onClose={() => setModalOpen(false)} account={editing} />
    </div>
  )
}
