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
  { id: 'agenda', label: 'Agenda', to: '/agenda', icon: 'CalendarDays' },
  {
    id: 'crm',
    label: 'CRM',
    icon: 'Users',
    children: [
      { label: 'Clientes', to: '/crm/clientes' },
      { label: 'Ventas', to: '/crm/ventas' },
    ],
  },
  { id: 'inventarios', label: 'Inventarios', to: '/inventarios', icon: 'Package' },
  { id: 'activos', label: 'Activos', to: '/activos', icon: 'Landmark' },
  {
    id: 'finanzas',
    label: 'Finanzas',
    icon: 'Wallet',
    children: [
      { label: 'Gastos', to: '/finanzas/gastos' },
      { label: 'Ingresos', to: '/finanzas/ingresos' },
    ],
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: 'BarChart3',
    children: [
      { label: 'Generales', to: '/reportes/generales' },
      { label: 'Inventario', to: '/reportes/inventario' },
      { label: 'Agenda', to: '/reportes/agenda' },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: 'Settings',
    children: [
      { label: 'Sucursales', to: '/configuracion/sucursales' },
      { label: 'Usuarios', to: '/configuracion/usuarios' },
      { label: 'Categorías', to: '/configuracion/categorias' },
      { label: 'Métodos de pago', to: '/configuracion/metodos-pago' },
    ],
  },
]
