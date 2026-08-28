import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { PAYROLL_PERIODS, PAYROLL_PERIOD_LABELS } from '@/data/rrhh'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'
import { Select } from '@/components/ui/Select'
import { ExportMenu } from '@/modules/finanzas/components/ExportMenu'
import { fullName, calcPayrollNet } from '../lib/rrhh'
import { getEmployeeBranchIds } from '../lib/staff'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { formatDOP } from '@/lib/format'

export default function NominaPage() {
  const employees = useRrhhStore((s) => s.employees)
  const payrollRuns = useRrhhStore((s) => s.payrollRuns)
  const closePayrollRun = useRrhhStore((s) => s.closePayrollRun)

  const now = new Date()
  const [period, setPeriod] = useState('quincena-1')
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees])

  const rows = useMemo(() => {
    return activeEmployees.map((emp) => {
      const { base, tss, isr, net } = calcPayrollNet(emp.salary)
      return { emp, base, tss, isr, net }
    })
  }, [activeEmployees])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (branchFilter !== 'all' && !getEmployeeBranchIds(r.emp).includes(branchFilter)) return false
      if (!q) return true
      return fullName(r.emp).toLowerCase().includes(q) || r.emp.position?.toLowerCase().includes(q)
    })
  }, [rows, query, branchFilter])

  const { rows: displayRows, sortKey, sortDir, toggleSort } = useSortedRows(filteredRows, {
    defaultSort: { key: 'employee', dir: 'asc' },
    accessors: {
      employee: (r) => fullName(r.emp),
      position: (r) => r.emp.position || '',
      base: (r) => r.base,
      tss: (r) => r.tss,
      isr: (r) => r.isr,
      net: (r) => r.net,
    },
  })

  const totals = useMemo(() => {
    const cost = filteredRows.reduce((s, r) => s + r.net, 0)
    const avg = filteredRows.length ? cost / filteredRows.length : 0
    return { cost, count: filteredRows.length, avg }
  }, [filteredRows])

  const isClosed = payrollRuns.some((r) => r.period === period && r.monthKey === monthKey)

  const exportRows = rows.map((r) => [
    fullName(r.emp),
    r.emp.position,
    formatDOP(r.base),
    formatDOP(r.tss),
    formatDOP(r.isr),
    formatDOP(r.net),
  ])

  const closePeriod = () => {
    if (isClosed) return toast.error('Este periodo ya está cerrado')
    closePayrollRun(period, monthKey)
    toast.success('Periodo marcado como cerrado')
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6 sm:p-8" data-testid="rrhh-nomina">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={period}
          onChange={setPeriod}
          options={PAYROLL_PERIODS.map((p) => ({ value: p, label: PAYROLL_PERIOD_LABELS[p] }))}
          className="max-w-xs"
        />
        <div className="flex gap-2">
          <ExportMenu
            title={`Nómina ${PAYROLL_PERIOD_LABELS[period]} — ${monthKey}`}
            subtitle="Deducciones estimadas TSS/ISR"
            filename={`nomina-${monthKey}-${period}`}
            columns={['Empleado', 'Cargo', 'Base', 'TSS', 'ISR', 'Neto']}
            rows={exportRows}
          />
          <Button variant="secondary" onClick={closePeriod} disabled={isClosed}>
            <Lock className="h-4 w-4" />
            {isClosed ? 'Periodo cerrado' : 'Cerrar periodo'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Costo nómina</p>
          <p className="mt-1 font-heading text-2xl font-bold">{formatDOP(totals.cost)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Empleados incluidos</p>
          <p className="mt-1 font-heading text-2xl font-bold">{totals.count}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Promedio neto</p>
          <p className="mt-1 font-heading text-2xl font-bold">{formatDOP(totals.avg)}</p>
        </Card>
      </div>

      <DataFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Buscar empleado..."
        showBranch
        branchId={branchFilter}
        onBranchChange={setBranchFilter}
        testId="rrhh-nomina-filters"
      />

      <Card className="overflow-hidden">
        <ResponsiveList columnCount={6}>
          <ResponsiveTable testId="rrhh-nomina-table" wrapCard={false}>
            <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <SortableTh column="employee" className="px-6 py-3">Empleado</SortableTh>
                  <SortableTh column="position" className="hidden px-6 py-3 md:table-cell">Cargo</SortableTh>
                  <SortableTh column="base" className="px-6 py-3">Base</SortableTh>
                  <SortableTh column="tss" className="hidden px-6 py-3 sm:table-cell">TSS</SortableTh>
                  <SortableTh column="isr" className="hidden px-6 py-3 sm:table-cell">ISR</SortableTh>
                  <SortableTh column="net" className="px-6 py-3">Neto</SortableTh>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(({ emp, base, tss, isr, net }) => (
                  <tr key={emp.id} className="border-b border-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-800">{fullName(emp)}</td>
                    <td className="hidden px-6 py-4 text-slate-600 md:table-cell">{emp.position}</td>
                    <td className="px-6 py-4">{formatDOP(base)}</td>
                    <td className="hidden px-6 py-4 text-red-600 sm:table-cell">-{formatDOP(tss)}</td>
                    <td className="hidden px-6 py-4 text-red-600 sm:table-cell">-{formatDOP(isr)}</td>
                    <td className="px-6 py-4 font-semibold text-emerald-700">{formatDOP(net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="rrhh-nomina-cards" className="p-4">
            {displayRows.map(({ emp, base, tss, isr, net }) => (
              <MobileCard key={emp.id} testId={`rrhh-nomina-card-${emp.id}`}>
                <MobileCardHeader title={fullName(emp)} subtitle={emp.position} />
                <MobileCardGrid>
                  <MobileField label="Base">{formatDOP(base)}</MobileField>
                  <MobileField label="TSS"><span className="text-red-600">-{formatDOP(tss)}</span></MobileField>
                  <MobileField label="ISR"><span className="text-red-600">-{formatDOP(isr)}</span></MobileField>
                  <MobileField label="Neto">
                    <span className="font-semibold text-emerald-700">{formatDOP(net)}</span>
                  </MobileField>
                </MobileCardGrid>
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
      </Card>
    </div>
  )
}
