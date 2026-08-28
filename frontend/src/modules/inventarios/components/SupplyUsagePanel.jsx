import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalogStore'
import { useInventarioStore } from '@/stores/inventarioStore'
import { useAgendaStore } from '@/stores/agendaStore'
import { useRrhhStore } from '@/stores/rrhhStore'
import { EMPLOYEES as LEGACY_EMPLOYEES } from '@/data/agenda'
import { allStaffOptions, getEmployeeBranchIds } from '@/modules/rrhh/lib/staff'
import { computeSupplyUsageKpis } from '../lib/supplyUsage'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataFilterBar } from '@/components/ui/DataFilterBar'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardGrid,
} from '@/components/ui/ResponsiveList'

export function SupplyUsagePanel() {
  const products = useCatalogStore((s) => s.products)
  const supplies = useMemo(() => products.filter((p) => p.type === 'supply'), [products])
  const movements = useInventarioStore((s) => s.movements)
  const appointments = useAgendaStore((s) => s.appointments)
  const rrhhEmployees = useRrhhStore((s) => s.employees)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  const employees = useMemo(() => {
    const merged = allStaffOptions(rrhhEmployees)
    const seen = new Set(merged.map((e) => e.id))
    LEGACY_EMPLOYEES.forEach((e) => {
      if (!seen.has(e.id)) merged.push(e)
    })
    return merged
  }, [rrhhEmployees])

  const rows = useMemo(
    () => computeSupplyUsageKpis({ movements, appointments, supplies, employees }),
    [movements, appointments, supplies, employees]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (branchFilter !== 'all') {
        const emp = rrhhEmployees.find((e) => e.id === r.employeeId)
        if (!getEmployeeBranchIds(emp).includes(branchFilter)) return false
      }
      if (!q) return true
      return r.employeeName?.toLowerCase().includes(q) || r.supplyName?.toLowerCase().includes(q)
    })
  }, [rows, search, branchFilter, rrhhEmployees])

  const { rows: displayRows, sortKey, sortDir, toggleSort } = useSortedRows(filtered, {
    defaultSort: { key: 'employeeName', dir: 'asc' },
    accessors: {
      employeeName: (r) => r.employeeName || '',
      supplyName: (r) => r.supplyName || '',
      qty: (r) => r.qty || 0,
      appointmentsCount: (r) => r.appointmentsCount || 0,
      perAppointment: (r) => r.perAppointment ?? -1,
    },
  })

  return (
    <Card className="overflow-hidden" data-testid="supply-usage-panel">
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-orange-600" />
          <div>
            <h3 className="font-heading text-lg font-semibold text-slate-900">Uso de insumos por personal</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Salidas atribuidas vs. citas atendidas (confirmada, asistió o completada).
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <DataFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar empleado o insumo..."
          showBranch
          branchId={branchFilter}
          onBranchChange={setBranchFilter}
          testId="supply-usage-filters"
        />
      </div>

      {displayRows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Sin datos de uso"
          description="Registra salidas de insumos con empleado asignado para ver métricas."
          className="py-10"
        />
      ) : (
        <ResponsiveList minTableWidth={640} columnCount={5}>
          <ResponsiveTable testId="supply-usage-table" wrapCard={false}>
            <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <SortableTh column="employeeName" className="px-5 py-3">Empleado</SortableTh>
                  <SortableTh column="supplyName" className="px-5 py-3">Insumo</SortableTh>
                  <SortableTh column="qty" align="right" className="px-5 py-3">Salidas</SortableTh>
                  <SortableTh column="appointmentsCount" align="right" className="px-5 py-3">Citas</SortableTh>
                  <SortableTh column="perAppointment" align="right" className="px-5 py-3">Por cita</SortableTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayRows.map((row) => (
                  <tr key={`${row.employeeId}-${row.supplyId}`} data-testid={`supply-usage-${row.employeeId}-${row.supplyId}`}>
                    <td className="px-5 py-3 font-medium text-slate-800">{row.employeeName}</td>
                    <td className="px-5 py-3 text-slate-600">{row.supplyName}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">{row.qty}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{row.appointmentsCount || '—'}</td>
                    <td className="px-5 py-3 text-right font-medium text-orange-700">
                      {row.perAppointment != null ? `~${row.perAppointment.toFixed(1)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </SortableTableProvider>
          </ResponsiveTable>
          <ResponsiveCards testId="supply-usage-cards" className="p-4 pt-0">
            {displayRows.map((row) => (
              <MobileCard key={`${row.employeeId}-${row.supplyId}`} testId={`supply-usage-card-${row.employeeId}-${row.supplyId}`}>
                <MobileCardHeader title={row.employeeName} subtitle={row.supplyName} />
                <MobileCardGrid>
                  <MobileField label="Salidas">
                    <span className="font-semibold text-slate-800">{row.qty}</span>
                  </MobileField>
                  <MobileField label="Citas">{row.appointmentsCount || '—'}</MobileField>
                  <MobileField label="Por cita" fullWidth>
                    <span className="font-medium text-orange-700">
                      {row.perAppointment != null ? `~${row.perAppointment.toFixed(1)}` : '—'}
                    </span>
                  </MobileField>
                </MobileCardGrid>
              </MobileCard>
            ))}
          </ResponsiveCards>
        </ResponsiveList>
      )}
    </Card>
  )
}
