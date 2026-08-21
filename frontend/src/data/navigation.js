// Navigation registry — add a module here and it appears in the sidebar.
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Vista General', to: '/dashboard', icon: 'LayoutDashboard' },
  { id: 'pos', label: 'Terminal POS', to: '/pos', icon: 'ScanLine' },
  { id: 'inventarios', label: 'Inventarios', to: '/inventarios', icon: 'Package', soon: true },
  { id: 'crm', label: 'CRM Clientes', to: '/crm/clientes', icon: 'Users', soon: true },
  { id: 'agenda', label: 'Agenda', to: '/agenda', icon: 'CalendarDays', soon: true },
  { id: 'finanzas', label: 'Finanzas', to: '/finanzas/gastos', icon: 'Wallet', soon: true },
  { id: 'reportes', label: 'Reportes', to: '/reportes', icon: 'BarChart3', soon: true },
  { id: 'configuracion', label: 'Configuración', to: '/configuracion', icon: 'Settings', soon: true },
]
