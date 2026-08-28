export const CURRENT_USER = {
  id: 'u1',
  name: 'Leonedis Hamburgo',
  role: 'Administrador',
  initials: 'LH',
}

export const DASHBOARD_FILTERS = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: 'Trimestre' },
]

export const KPIS = {
  today: [
    { id: 'ingresos', label: 'Ingresos Hoy', value: 2000, kind: 'currency', tag: 'Actualización en vivo', icon: 'DollarSign', tone: 'brand' },
    { id: 'leads', label: 'Leads Activos', value: 4073, kind: 'number', tag: 'Oportunidades en progreso', icon: 'UserPlus', tone: 'sky' },
    { id: 'personal', label: 'Personal', value: null, kind: 'raw', tag: 'Módulo en desarrollo', icon: 'Users', tone: 'violet' },
    { id: 'tareas', label: 'Tareas Abiertas', value: 0, kind: 'number', tag: 'Pendientes', icon: 'ClipboardList', tone: 'amber' },
  ],
  week: [
    { id: 'ingresos', label: 'Ingresos Semana', value: 48200, kind: 'currency', tag: 'Actualización en vivo', icon: 'DollarSign', tone: 'brand' },
    { id: 'leads', label: 'Leads Activos', value: 4120, kind: 'number', tag: 'Oportunidades en progreso', icon: 'UserPlus', tone: 'sky' },
    { id: 'personal', label: 'Personal', value: null, kind: 'raw', tag: 'Módulo en desarrollo', icon: 'Users', tone: 'violet' },
    { id: 'tareas', label: 'Tareas Abiertas', value: 6, kind: 'number', tag: 'Pendientes', icon: 'ClipboardList', tone: 'amber' },
  ],
  month: [
    { id: 'ingresos', label: 'Ingresos Mes', value: 214750, kind: 'currency', tag: 'Actualización en vivo', icon: 'DollarSign', tone: 'brand' },
    { id: 'leads', label: 'Leads Activos', value: 4310, kind: 'number', tag: 'Oportunidades en progreso', icon: 'UserPlus', tone: 'sky' },
    { id: 'personal', label: 'Personal', value: 18, kind: 'number', tag: 'Equipo activo', icon: 'Users', tone: 'violet' },
    { id: 'tareas', label: 'Tareas Abiertas', value: 12, kind: 'number', tag: 'Pendientes', icon: 'ClipboardList', tone: 'amber' },
  ],
  quarter: [
    { id: 'ingresos', label: 'Ingresos Trimestre', value: 642300, kind: 'currency', tag: 'Actualización en vivo', icon: 'DollarSign', tone: 'brand' },
    { id: 'leads', label: 'Leads Activos', value: 4560, kind: 'number', tag: 'Oportunidades en progreso', icon: 'UserPlus', tone: 'sky' },
    { id: 'personal', label: 'Personal', value: 18, kind: 'number', tag: 'Equipo activo', icon: 'Users', tone: 'violet' },
    { id: 'tareas', label: 'Tareas Abiertas', value: 27, kind: 'number', tag: 'Pendientes', icon: 'ClipboardList', tone: 'amber' },
  ],
}

export const SALES_TREND = {
  today: { total: 2000, points: [
    { label: '8 AM', value: 0 }, { label: '10 AM', value: 2000 }, { label: '12 PM', value: 2000 },
    { label: '2 PM', value: 2000 }, { label: '4 PM', value: 2000 }, { label: '6 PM', value: 2000 }, { label: '8 PM', value: 2000 },
  ] },
  week: { total: 498050, points: [
    { label: 'sáb 15', value: 250000 }, { label: 'dom 16', value: 5000 }, { label: 'lun 17', value: 82000 },
    { label: 'mar 18', value: 60000 }, { label: 'mié 19', value: 58000 }, { label: 'jue 20', value: 40000 }, { label: 'vie 21', value: 3050 },
  ] },
  month: { total: 214750, points: [
    { label: 'Sem 1', value: 62000 }, { label: 'Sem 2', value: 48000 }, { label: 'Sem 3', value: 51750 }, { label: 'Sem 4', value: 53000 },
  ] },
  quarter: { total: 642300, points: [
    { label: 'Abr', value: 198000 }, { label: 'May', value: 214750 }, { label: 'Jun', value: 229550 },
  ] },
}

export const STOCK_ALERTS = [
  { id: 's1', name: 'Crema de leche', sku: 'N/A', units: 0, level: 'critical' },
  { id: 's2', name: 'Red Bull', sku: 'N/A', units: 0, level: 'critical' },
  { id: 's3', name: 'Coca cola normal', sku: 'N/A', units: 0, level: 'critical' },
  { id: 's4', name: 'Hamburguesa', sku: 'N/A', units: 0, level: 'critical' },
  { id: 's5', name: 'Servilletas', sku: 'PRD-21', units: 3, level: 'low' },
  { id: 's6', name: 'Guantes nitrilo', sku: 'PRD-33', units: 5, level: 'low' },
]

export const RECENT_ACTIVITY = [
  { id: 'a1', title: 'Ingreso registrado por RD$ 2,000', time: '10:17 AM', source: 'CRM', icon: 'FileText', to: '/crm/ventas' },
  { id: 'a2', title: 'Nuevo lead capturado: Carla Jiménez', time: '09:52 AM', source: 'CRM', icon: 'UserPlus', to: '/crm/clientes' },
  { id: 'a3', title: 'Caja abierta en Charm DN', time: '08:30 AM', source: 'POS', icon: 'Store', to: '/pos/caja' },
  { id: 'a4', title: 'Producto agotado: Red Bull', time: 'Ayer · 6:40 PM', source: 'Inventario', icon: 'PackageX', to: '/inventarios' },
]

export const APPOINTMENTS_TODAY = []
