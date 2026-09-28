// Synthetic visual fixtures for phase 0 only. Never hydrate connected workspaces
// or write these IDs to shared customer, catalog, employee, or POS stores.
export const CARWASH_PREVIEW_DATE = '2026-09-28'

export const PREVIEW_SERVICES = [
  { id: 'cw-demo-basic', name: 'Lavado básico', category: 'Carwash / General', price: '500.00', washerRate: '20.00', supervisorRate: '5.00', active: true },
  { id: 'cw-demo-premium', name: 'Lavado premium SUV', category: 'Carwash / Premium', price: '900.00', washerRate: '20.00', supervisorRate: '5.00', active: true },
  { id: 'cw-demo-wax', name: 'Encerado', category: 'Carwash / Detallado', price: '300.00', washerRate: '20.00', supervisorRate: '5.00', active: true },
]

export const PREVIEW_EMPLOYEES = [
  { id: 'cw-demo-alex', name: 'Alex Demo' },
  { id: 'cw-demo-sam', name: 'Sam Demo' },
]

export const PREVIEW_WASHES = [
  { id: 'cw-demo-001', date: '2026-09-28', time: '10:20', customer: 'Cliente de ejemplo 1', plate: 'DEMO-001', vehicle: 'Sedán · Gris', service: 'Lavado básico', washerId: 'cw-demo-alex', supervisorId: 'cw-demo-sam', total: '590.00', payment: 'Por confirmar', status: 'waiting' },
  { id: 'cw-demo-002', date: '2026-09-28', time: '09:45', customer: 'Cliente de ejemplo 2', plate: 'DEMO-002', vehicle: 'SUV · Blanco', service: 'Lavado premium SUV', washerId: 'cw-demo-alex', supervisorId: 'cw-demo-sam', total: '1062.00', payment: 'Por confirmar', status: 'washing' },
  { id: 'cw-demo-003', date: '2026-09-28', time: '09:10', customer: 'Cliente de ejemplo 3', plate: 'DEMO-003', vehicle: 'Sedán · Azul', service: 'Lavado básico + Encerado', washerId: 'cw-demo-sam', supervisorId: 'cw-demo-sam', total: '944.00', payment: 'CxC pendiente', status: 'completed' },
]

export const PREVIEW_COMMISSIONS = [
  { id: 'cw-demo-c1', washId: 'cw-demo-003', date: '2026-09-28', employeeId: 'cw-demo-sam', role: 'washer', plate: 'DEMO-003', service: 'Lavado básico', base: '500.00', rate: '20.00', amount: '100.00', status: 'pending' },
  { id: 'cw-demo-c2', washId: 'cw-demo-003', date: '2026-09-28', employeeId: 'cw-demo-sam', role: 'supervisor', plate: 'DEMO-003', service: 'Lavado básico', base: '500.00', rate: '5.00', amount: '25.00', status: 'pending' },
  { id: 'cw-demo-c3', washId: 'cw-demo-003', date: '2026-09-28', employeeId: 'cw-demo-sam', role: 'washer', plate: 'DEMO-003', service: 'Encerado', base: '300.00', rate: '20.00', amount: '60.00', status: 'paid' },
  { id: 'cw-demo-c4', washId: 'cw-demo-003', date: '2026-09-28', employeeId: 'cw-demo-sam', role: 'supervisor', plate: 'DEMO-003', service: 'Encerado', base: '300.00', rate: '5.00', amount: '15.00', status: 'paid' },
]

export function employeeName(id) {
  return PREVIEW_EMPLOYEES.find((employee) => employee.id === id)?.name || '—'
}

export function previewData({ isDemo, populated, branchId }) {
  // Only one demo branch has example records, so branch switching has visible effect.
  const visible = isDemo && populated && branchId === 'charm-dn'
  return {
    washes: visible ? PREVIEW_WASHES : [],
    commissions: visible ? PREVIEW_COMMISSIONS : [],
    services: visible ? PREVIEW_SERVICES : [],
    employees: visible ? PREVIEW_EMPLOYEES : [],
  }
}
