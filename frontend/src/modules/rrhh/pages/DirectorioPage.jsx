import { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Mail, Phone, Users, Building2, Clock } from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useConfigStore } from '@/stores/configStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmployeeFormModal } from '../components/EmployeeFormModal'
import { fullName, initials } from '../lib/rrhh'
import { countEmployeesByBranch, getDirectReports, getEmployeeBranchIds, getJefeIds } from '../lib/staff'
import { hasConfiguredSchedule, summarizeSchedule } from '../lib/schedule'
import { formatDOP } from '@/lib/format'
import { cn } from '@/lib/utils'

function StatChip({ label, value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-4 py-3 text-left transition-colors',
        active ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-white hover:border-slate-200'
      )}
    >
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="font-heading text-xl font-bold text-slate-800">{value}</p>
    </button>
  )
}

export default function DirectorioPage() {
  const employees = useRrhhStore((s) => s.employees)
  const addEmployee = useRrhhStore((s) => s.addEmployee)
  const updateEmployee = useRrhhStore((s) => s.updateEmployee)
  const branches = useConfigStore((s) => s.branches)

  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const branchMap = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.name])), [branches])
  const counts = useMemo(() => countEmployeesByBranch(employees, branches), [employees, branches])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees.filter((e) => {
      if (branchFilter !== 'all' && !getEmployeeBranchIds(e).includes(branchFilter)) return false
      if (!q) return true
      const name = fullName(e).toLowerCase()
      return name.includes(q) || e.position?.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q)
    })
  }, [employees, query, branchFilter])

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (emp) => { setEditing(emp); setModalOpen(true) }

  const handleSubmit = (data) => {
    if (editing) updateEmployee(editing.id, data)
    else addEmployee(data)
  }

  const jefeName = (id) => fullName(employees.find((e) => e.id === id))

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="rrhh-directorio">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <StatChip label="Total empleados" value={counts.total} active={branchFilter === 'all'} onClick={() => setBranchFilter('all')} />
        <StatChip label="Activos" value={counts.active} active={false} />
        {branches.filter((b) => b.active).map((b) => (
          <StatChip
            key={b.id}
            label={b.name}
            value={counts[b.id] || 0}
            active={branchFilter === b.id}
            onClick={() => setBranchFilter(b.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar empleados..."
            className="w-full rounded-xl border-0 bg-slate-50 py-2.5 pl-10 pr-4 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <Button onClick={openNew} data-testid="new-employee-btn">
          <Plus className="h-4 w-4" />
          Nuevo Empleado
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((emp) => {
          const reports = getDirectReports(employees, emp.id)
          const jefes = getJefeIds(emp).map(jefeName).filter(Boolean)
          const branchIds = getEmployeeBranchIds(emp)

          return (
            <Card key={emp.id} className="p-5" data-testid={`employee-card-${emp.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                    {initials(emp)}
                  </div>
                  <div>
                    <p className="font-heading font-semibold text-slate-900">{fullName(emp)}</p>
                    <p className="text-sm text-slate-500">{emp.position}</p>
                  </div>
                </div>
                <button type="button" onClick={() => openEdit(emp)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-blue-600">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {branchIds.map((id) => (
                  <Badge key={id} tone="brand">{branchMap[id] || id}</Badge>
                ))}
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p><span className="text-slate-400">Depto:</span> {emp.department}</p>
                <p><span className="text-slate-400">Ingreso:</span> {emp.hireDate}</p>
                {emp.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" />{emp.email}</p>}
                {emp.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" />{emp.phone}</p>}
                <p><span className="text-slate-400">Salario inicial:</span> {formatDOP(emp.initialSalary)}</p>
                <p><span className="text-slate-400">Salario actual:</span> {formatDOP(emp.salary)}</p>
                {jefes.length > 0 && (
                  <p className="flex items-start gap-2">
                    <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span><span className="text-slate-400">Jefes:</span> {jefes.join(', ')}</span>
                  </p>
                )}
                {reports.length > 0 && (
                  <p className="flex items-center gap-2 text-blue-600">
                    <Users className="h-3.5 w-3.5" />
                    {reports.length} reporte{reports.length !== 1 ? 's' : ''} directo{reports.length !== 1 ? 's' : ''}
                  </p>
                )}
                {emp.bankName && (
                  <p className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    {emp.bankName} · {emp.bankAccountType} {emp.bankAccountNumber}
                  </p>
                )}
                <p className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>
                    <span className="text-slate-400">Horario:</span>{' '}
                    {hasConfiguredSchedule(emp.workSchedule) ? summarizeSchedule(emp.workSchedule) : 'Horario general 8:00–20:00'}
                  </span>
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Badge tone={emp.active ? 'success' : 'neutral'}>{emp.active ? 'Activo' : 'Inactivo'}</Badge>
                {emp.usuarioId && <span className="text-xs text-slate-400">Usuario vinculado</span>}
              </div>
            </Card>
          )
        })}
      </div>

      {list.length === 0 && (
        <Card className="p-12 text-center text-slate-500">No se encontraron empleados.</Card>
      )}

      <EmployeeFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        employee={editing}
        employees={employees}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
