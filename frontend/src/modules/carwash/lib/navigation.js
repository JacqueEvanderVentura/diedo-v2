export const CARWASH_TABS = [
  { id: 'operativo', label: 'Control Operativo', permission: 'carwash.read', icon: 'Car' },
  { id: 'comisiones', label: 'Comisiones Lavador / Encargado', permission: 'carwash.commissions.read', icon: 'DollarSign' },
  { id: 'reportes', label: 'Gráficos & Reportes', permission: 'carwash.reports.read', icon: 'ChartPie' },
  { id: 'configuracion', label: 'Configuración Rápida', permission: 'carwash.settings.manage', icon: 'Settings' },
]

export const WASH_STATES = {
  waiting: { label: 'En espera', tone: 'warning' },
  washing: { label: 'Lavando', tone: 'brand' },
  completed: { label: 'Completado', tone: 'success' },
  voided: { label: 'Anulado', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
}

export function resolveCarwashScope(params, branches, hasPermission, activeBranchId) {
  const requestedTab = CARWASH_TABS.find((tab) => tab.id === params.get('tab'))
  const tab = requestedTab && hasPermission(requestedTab.permission) ? requestedTab.id : 'operativo'
  const allowedIds = new Set(branches.map((branch) => branch.id))
  const requestedBranch = params.get('branchId')
  const branchId = allowedIds.has(requestedBranch)
    ? requestedBranch
    : allowedIds.has(activeBranchId) ? activeBranchId : branches[0]?.id || ''
  return { tab, branchId }
}

export function filterPreviewWashes(washes, params) {
  const query = (params.get('search') || '').trim().toLocaleLowerCase('es')
  const state = params.get('washStatus') || 'all'
  const employee = params.get('employeeId') || 'all'
  return washes.filter((wash) => (
    (!query || `${wash.plate} ${wash.customer} ${wash.service}`.toLocaleLowerCase('es').includes(query))
    && (state === 'all' || wash.status === state)
    && (employee === 'all' || wash.washerId === employee || wash.supervisorId === employee)
  ))
}

export function filterPreviewCommissions(commissions, params) {
  const employee = params.get('employeeId') || 'all'
  const state = params.get('commissionStatus') || 'all'
  const from = params.get('dateFrom') || ''
  const to = params.get('dateTo') || ''
  return commissions.filter((item) => (
    (employee === 'all' || item.employeeId === employee)
    && (state === 'all' || item.status === state)
    && (!from || item.date >= from) && (!to || item.date <= to)
  ))
}
