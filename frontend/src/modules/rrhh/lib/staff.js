import { useMemo } from 'react'
import { useRrhhStore } from '@/stores/rrhhStore'
import { EMPLOYEES as LEGACY_EMPLOYEES } from '@/data/agenda'
import { fullName } from './rrhh'

export function getEmployeeBranchIds(emp) {
  if (!emp) return []
  if (Array.isArray(emp.branchIds) && emp.branchIds.length) return emp.branchIds
  if (emp.branchId) return [emp.branchId]
  return []
}

export function getJefeIds(emp) {
  if (!emp) return []
  if (Array.isArray(emp.jefeIds) && emp.jefeIds.length) return emp.jefeIds
  if (emp.jefeId) return [emp.jefeId]
  return []
}

export function employeeWorksAtBranch(emp, branchId) {
  if (!emp?.active || !branchId) return false
  return getEmployeeBranchIds(emp).includes(branchId)
}

export function staffOptionsForBranch(employees, branchId, { includeLegacy = true } = {}) {
  const rrhh = employees
    .filter((e) => e.active && employeeWorksAtBranch(e, branchId))
    .map((e) => ({ id: e.id, name: fullName(e) }))

  if (!includeLegacy) return rrhh.sort((a, b) => a.name.localeCompare(b.name))

  const legacy = branchId === 'charm-dn' ? LEGACY_EMPLOYEES : []
  const seen = new Set(rrhh.map((e) => e.id))
  legacy.forEach((e) => {
    if (!seen.has(e.id)) rrhh.push(e)
  })
  return rrhh.sort((a, b) => a.name.localeCompare(b.name))
}

export function allStaffOptions(employees) {
  return employees
    .filter((e) => e.active)
    .map((e) => ({ id: e.id, name: fullName(e) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function resolveStaffName(id, employees = []) {
  if (!id) return '—'
  const rrhh = employees.find((e) => e.id === id)
  if (rrhh) return fullName(rrhh)
  return LEGACY_EMPLOYEES.find((e) => e.id === id)?.name || '—'
}

export function useBranchStaff(branchId) {
  const employees = useRrhhStore((s) => s.employees)
  return useMemo(() => staffOptionsForBranch(employees, branchId), [employees, branchId])
}

export function useStaffName() {
  const employees = useRrhhStore((s) => s.employees)
  return useMemo(() => (id) => resolveStaffName(id, employees), [employees])
}

export function countEmployeesByBranch(employees, branches) {
  const counts = { total: employees.length, active: employees.filter((e) => e.active).length }
  branches.forEach((b) => {
    counts[b.id] = employees.filter((e) => e.active && employeeWorksAtBranch(e, b.id)).length
  })
  return counts
}

export function getDirectReports(employees, managerId) {
  return employees.filter((e) => getJefeIds(e).includes(managerId))
}
