import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Search, DollarSign, CheckCircle2 } from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { DEBT_STATUS_META } from '@/data/rrhh'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
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
import { Modal } from '@/components/ui/Modal'
import { fullName, debtBalance, debtStatus } from '../lib/rrhh'
import { getEmployeeBranchIds } from '../lib/staff'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'

const FILTERS = ['todos', 'pendiente', 'parcial', 'pagado']

export default function CuentasPorCobrarPage() {
  const employees = useRrhhStore((s) => s.employees)
  const employeeDebts = useRrhhStore((s) => s.employeeDebts)
  const getDebtStats = useRrhhStore((s) => s.getDebtStats)
  const addEmployeeDebt = useRrhhStore((s) => s.addEmployeeDebt)
  const addDebtPayment = useRrhhStore((s) => s.addDebtPayment)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('todos')
  const [branchFilter, setBranchFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [payModal, setPayModal] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [form, setForm] = useState({ employeeId: '', concept: '', clientName: '', amount: '' })

  const stats = useMemo(() => getDebtStats(), [employeeDebts, getDebtStats])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employeeDebts.filter((d) => {
      const emp = employees.find((e) => e.id === d.employeeId)
      const name = fullName(emp).toLowerCase()
      const status = debtStatus(d)
      if (branchFilter !== 'all' && !getEmployeeBranchIds(emp).includes(branchFilter)) return false
      if (filter !== 'todos' && status !== filter) return false
      if (!q) return true
      return name.includes(q) || d.concept?.toLowerCase().includes(q) || d.clientName?.toLowerCase().includes(q)
    })
  }, [employeeDebts, employees, query, filter, branchFilter])

  const { rows: list, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'employee', dir: 'asc' },
    accessors: {
      employee: (d) => fullName(employees.find((e) => e.id === d.employeeId)),
      concept: (d) => d.concept || '',
      amount: (d) => d.amount || 0,
      balance: (d) => debtBalance(d),
      status: (d) => debtStatus(d),
    },
  })

  const hasPending = stats.pending > 0

  const submitDebt = () => {
    if (!form.employeeId) return toast.error('Selecciona un empleado')
    if (!form.concept.trim()) return toast.error('Ingresa el concepto')
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Ingresa un monto válido')
    addEmployeeDebt({
      employeeId: form.employeeId,
      concept: form.concept.trim(),
      clientName: form.clientName.trim() || null,
      amount: Number(form.amount),
    })
    toast.success('Deuda registrada')
    setModalOpen(false)
    setForm({ employeeId: '', concept: '', clientName: '', amount: '' })
  }

  const submitPayment = () => {
    const amt = Number(payAmount)
    if (!amt || amt <= 0) return toast.error('Ingresa un monto válido')
    const balance = debtBalance(payModal)
    if (amt > balance) return toast.error('El monto excede el saldo pendiente')
    addDebtPayment(payModal.id, amt)
    toast.success('Pago registrado')
    setPayModal(null)
    setPayAmount('')
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="rrhh-cxc">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Total deuda</p>
          <p className="mt-1 font-heading text-2xl font-bold">{formatDOP(stats.totalDebt)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Pagado</p>
          <p className="mt-1 font-heading text-2xl font-bold text-emerald-600">{formatDOP(stats.totalPaid)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Pendiente</p>
          <p className="mt-1 font-heading text-2xl font-bold text-amber-600">{formatDOP(stats.pending)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Empleados con deuda</p>
          <p className="mt-1 font-heading text-2xl font-bold">{stats.employeesWithDebt}</p>
        </Card>
      </div>

      <DataFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Buscar deudas..."
        showBranch
        branchId={branchFilter}
        onBranchChange={setBranchFilter}
        testId="rrhh-cxc-filters"
        extra={
          <div className="flex rounded-xl bg-slate-100 p-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  filter === f ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                )}
              >
                {f === 'todos' ? 'Todos' : f}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Nueva deuda</Button>
      </div>

      {!hasPending && list.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="font-heading text-lg font-semibold text-emerald-700">Sin deudas pendientes</p>
          <p className="text-sm text-slate-500">Todos los empleados están al día.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ResponsiveList columnCount={6}>
            <ResponsiveTable testId="rrhh-cxc-table" wrapCard={false}>
              <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <SortableTh column="employee" className="px-6 py-3">Empleado</SortableTh>
                    <SortableTh column="concept" className="hidden px-6 py-3 md:table-cell">Concepto</SortableTh>
                    <SortableTh column="amount" className="px-6 py-3">Monto</SortableTh>
                    <SortableTh column="balance" className="px-6 py-3">Saldo</SortableTh>
                    <SortableTh column="status" className="px-6 py-3">Estado</SortableTh>
                    <SortableTh sortable={false} className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => {
                    const emp = employees.find((e) => e.id === d.employeeId)
                    const status = debtStatus(d)
                    const meta = DEBT_STATUS_META[status]
                    const balance = debtBalance(d)
                    return (
                      <tr key={d.id} className="border-b border-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-800">{fullName(emp)}</td>
                        <td className="hidden px-6 py-4 text-slate-600 md:table-cell">
                          {d.concept}
                          {d.clientName && <span className="block text-xs text-slate-400">{d.clientName}</span>}
                        </td>
                        <td className="px-6 py-4">{formatDOP(d.amount)}</td>
                        <td className="px-6 py-4 font-medium">{formatDOP(balance)}</td>
                        <td className="px-6 py-4"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className="px-6 py-4 text-right">
                          {balance > 0 && (
                            <Button size="sm" variant="secondary" onClick={() => { setPayModal(d); setPayAmount(String(balance)) }}>
                              <DollarSign className="h-4 w-4" /> Pagar
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </SortableTableProvider>
            </ResponsiveTable>
            <ResponsiveCards testId="rrhh-cxc-cards" className="p-4">
              {list.map((d) => {
                const emp = employees.find((e) => e.id === d.employeeId)
                const status = debtStatus(d)
                const meta = DEBT_STATUS_META[status]
                const balance = debtBalance(d)
                return (
                  <MobileCard key={d.id} testId={`rrhh-cxc-card-${d.id}`}>
                    <MobileCardHeader
                      title={fullName(emp)}
                      subtitle={d.concept}
                      badge={<Badge tone={meta.tone}>{meta.label}</Badge>}
                    />
                    {d.clientName && <p className="mt-1 text-xs text-slate-400">{d.clientName}</p>}
                    <MobileCardGrid className="mt-3">
                      <MobileField label="Monto">{formatDOP(d.amount)}</MobileField>
                      <MobileField label="Saldo">
                        <span className="font-medium">{formatDOP(balance)}</span>
                      </MobileField>
                    </MobileCardGrid>
                    {balance > 0 && (
                      <MobileCardFooter>
                        <span />
                        <Button size="sm" variant="secondary" onClick={() => { setPayModal(d); setPayAmount(String(balance)) }}>
                          <DollarSign className="h-4 w-4" /> Pagar
                        </Button>
                      </MobileCardFooter>
                    )}
                  </MobileCard>
                )
              })}
            </ResponsiveCards>
          </ResponsiveList>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Registrar deuda">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Empleado</label>
            <Select value={form.employeeId} onChange={(v) => setForm((f) => ({ ...f, employeeId: v }))} options={employees.filter((e) => e.active).map((e) => ({ value: e.id, label: fullName(e) }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Concepto</label>
            <Input value={form.concept} onChange={(e) => setForm((f) => ({ ...f, concept: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Cliente (opcional)</label>
            <Input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Monto</label>
            <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={submitDebt}>Registrar</Button>
        </div>
      </Modal>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Registrar pago">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Monto del pago</label>
          <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          {payModal && <p className="mt-2 text-sm text-slate-500">Saldo pendiente: {formatDOP(debtBalance(payModal))}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPayModal(null)}>Cancelar</Button>
          <Button onClick={submitPayment}>Registrar pago</Button>
        </div>
      </Modal>
    </div>
  )
}
