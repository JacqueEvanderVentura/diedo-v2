// Navigation registry — grouped. A group with `children` renders as an
// expandable section; an item with `to` renders as a direct link.
export const NAV_GROUPS = [
  { id: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: 'LayoutDashboard' },
  {
    id: 'pos',
    label: 'Terminal POS',
    icon: 'ShoppingCart',
    children: [
      { label: 'Punto de Venta', to: '/pos' },
      { label: 'Caja', to: '/pos/caja' },
      { label: 'Cuentas por Cobrar', to: '/pos/cuentas-por-cobrar' },
    ],
  },
  { id: 'agenda', label: 'Agenda', to: '/agenda', icon: 'CalendarDays', soon: true },
  {
    id: 'crm',
    label: 'CRM',
    icon: 'Users',
    children: [
      { label: 'Overview', to: '/crm', soon: true },
      { label: 'Clientes & Leads', to: '/crm/clientes', soon: true },
      { label: 'Pipeline', to: '/crm/pipeline', soon: true },
      { label: 'Seguimientos', to: '/crm/seguimientos', soon: true },
    ],
  },
  { id: 'inventarios', label: 'Inventarios', to: '/inventarios', icon: 'Package' },
  {
    id: 'finanzas',
    label: 'Finanzas',
    icon: 'Wallet',
    children: [
      { label: 'Gastos', to: '/finanzas/gastos', soon: true },
      { label: 'Ingresos', to: '/finanzas/ingresos', soon: true },
    ],
  },
  { id: 'reportes', label: 'Reportes', to: '/reportes', icon: 'BarChart3', soon: true },
  { id: 'configuracion', label: 'Configuración', to: '/configuracion', icon: 'Settings', soon: true },
]
