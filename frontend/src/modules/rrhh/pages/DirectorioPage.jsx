import { useMemo, useState } from 'react'
import { Plus, Search, Pencil, Mail, Phone, MapPin } from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { useConfigStore } from '@/stores/configStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmployeeFormModal } from '../components/EmployeeFormModal'
import { fullName, initials } from '../lib/rrhh'
import { formatDOP } from '@/lib/format'

export default function DirectorioPage() {
  const employees = useRrhhStore((s) => s.employees)
  const addEmployee = useRrhhStore((s) => s.addEmployee)
  const updateEmployee = useRrhhStore((s) => s.updateEmployee)
  const branches = useConfigStore((s) => s.branches)

  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const branchMap = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.name])), [branches])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees.filter((e) => {
      if (!q) return true
      const name = fullName(e).toLowerCase()
      return name.includes(q) || e.position?.toLowerCase().includes(q) || e.department?.toLowerCase().includes(q)
    })
  }, [employees, query])

  const openNew = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (emp) => { setEditing(emp); setModalOpen(true) }

  const handleSubmit = (data) => {
    if (editing) updateEmployee(editing.id, data)
    else addEmployee(data)
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="rrhh-directorio">
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
        {list.map((emp) => (
          <Card key={emp.id} className="p-5">
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

            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="text-slate-400">Depto:</span> {emp.department}</p>
              <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-slate-400" />{branchMap[emp.branchId] || '—'}</p>
              {emp.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" />{emp.email}</p>}
              {emp.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" />{emp.phone}</p>}
              <p><span className="text-slate-400">Contrato:</span> {emp.contractType}</p>
              <p><span className="text-slate-400">Salario:</span> {formatDOP(emp.salary)}</p>
              <p><span className="text-slate-400">Días vac.:</span> {emp.vacationDays}</p>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <Badge tone={emp.active ? 'success' : 'neutral'}>{emp.active ? 'Activo' : 'Inactivo'}</Badge>
              {emp.usuarioId && <span className="text-xs text-slate-400">Usuario vinculado</span>}
            </div>
          </Card>
        ))}
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
