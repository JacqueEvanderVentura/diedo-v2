/** Display names matching sidebar / ERP modules. Backend catalog uses the same labels. */
export const MODULE_LABELS = Object.freeze({
  foundation: 'Base',
  dashboard: 'Dashboard',
  iam: 'Usuarios y permisos',
  crm: 'CRM',
  catalog: 'Inventarios',
  sales: 'Ventas',
  purchasing: 'Compras',
  inventory: 'Inventario y activos',
  incidents: 'Incidencias',
  chat: 'Chat',
  finance: 'Finanzas',
  reporting: 'Reportes',
  accounting: 'Contabilidad',
  hr: 'RRHH',
  payroll: 'Nómina',
  pos: 'Terminal POS',
  carwash: 'Carwash',
  appointments: 'Agenda',
  lodging: 'Hospedaje',
})

export function moduleLabel(code, fallback = '') {
  if (!code) return fallback
  return MODULE_LABELS[code] || fallback || code
}
