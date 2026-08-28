import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { PAYROLL_PERIODS, PAYROLL_PERIOD_LABELS } from '@/data/rrhh'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { ExportMenu } from '@/modules/finanzas/components/ExportMenu'
import { fullName, calcPayrollNet } from '../lib/rrhh'
import { formatDOP } from '@/lib/format'

export default function NominaPage() {
  const employees = useRrhhStore((s) => s.employees)
  const payrollRuns = useRrhhStore((s) => s.payrollRuns)
  const closePayrollRun = useRrhhStore((s) => s.closePayrollRun)

  const now = new Date()
  const [period, setPeriod] = useState('quincena-1')
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees])

  const rows = useMemo(() => {
    return activeEmployees.map((emp) => {
      const { base, tss, isr, net } = calcPayrollNet(emp.salary)
      return { emp, base, tss, isr, net }
    })
  }, [activeEmployees])

  const totals = useMemo(() => {
    const cost = rows.reduce((s, r) => s + r.net, 0)
    const avg = rows.length ? cost / rows.length : 0
    return { cost, count: rows.length, avg }
  }, [rows])

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

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-6 py-3">Empleado</th>
              <th className="hidden px-6 py-3 md:table-cell">Cargo</th>
              <th className="px-6 py-3">Base</th>
              <th className="hidden px-6 py-3 sm:table-cell">TSS</th>
              <th className="hidden px-6 py-3 sm:table-cell">ISR</th>
              <th className="px-6 py-3">Neto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, base, tss, isr, net }) => (
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
      </Card>
    </div>
  )
}
