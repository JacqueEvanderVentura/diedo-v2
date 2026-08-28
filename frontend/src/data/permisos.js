export const USER_ROLES = ['Administrador', 'Gerente', 'Supervisor', 'Cajero', 'Vendedor']

export const PERMISSION_MODULES = [
  { id: 'dashboard', name: 'Dashboard', description: 'Panel principal con métricas y resumen', actions: ['Ver'] },
  {
    id: 'pos',
    name: 'Terminal POS',
    description: 'Punto de venta y gestión de caja',
    actions: ['Ver', 'Vender', 'Aplicar Descuentos', 'Anular Ventas', 'Gestionar Caja', 'Registrar Gastos', 'Cuentas por Cobrar'],
  },
  {
    id: 'agenda',
    name: 'Agenda',
    description: 'Gestión de citas y horarios',
    actions: ['Ver', 'Crear Citas', 'Editar Citas', 'Eliminar Citas', 'Gestión de Citas (Listado)'],
  },
  { id: 'crm', name: 'CRM', description: 'Gestión de clientes y oportunidades', actions: ['Ver', 'Crear', 'Editar', 'Eliminar', 'Exportar'] },
  {
    id: 'rrhh',
    name: 'RRHH',
    description: 'Recursos humanos y empleados',
    actions: ['Ver', 'Ver Directorio', 'Crear Empleados', 'Editar', 'Ver Nómina', 'Generar Documentos', 'Performance', 'Incidentes'],
  },
  {
    id: 'finanzas',
    name: 'Finanzas',
    description: 'Gestión financiera y reportes',
    actions: ['Ver', 'Gestionar Gastos', 'Gastos Fijos', 'Pasivos', 'Gestionar Ingresos', 'Presupuestos', 'Reportes'],
  },
  {
    id: 'inventarios',
    name: 'Inventarios',
    description: 'Gestión de productos y stock',
    actions: ['Ver', 'Crear Productos', 'Editar Productos', 'Eliminar Productos', 'Ajustar Stock'],
  },
  {
    id: 'reportes',
    name: 'Reportes Avanzados',
    description: 'Reportes generales y estadísticos',
    actions: ['Ver', 'Reportes Generales', 'Dividendos', 'Membresías', 'SaaS', 'Reporte de Personal'],
  },
  {
    id: 'configuracion',
    name: 'Configuración',
    description: 'Configuración del sistema',
    actions: ['Ver', 'Gestionar Categorías', 'Gestionar Usuarios', 'Gestionar Sucursales', 'Gestionar Permisos'],
  },
  { id: 'proyectos', name: 'Proyectos', description: 'Gestión de proyectos y tareas del equipo', actions: ['Ver', 'Crear', 'Editar', 'Eliminar'] },
  { id: 'incidencias', name: 'Incidencias', description: 'Gestión de incidencias y soporte', actions: ['Ver', 'Crear', 'Editar', 'Eliminar', 'Resolver'] },
  { id: 'documentos', name: 'Documentos', description: 'Gestión de documentos generales', actions: ['Ver'] },
  { id: 'doway', name: 'DoWay', description: 'Integración y configuración de aplicación DoWay', actions: ['Ver', 'Administrar'] },
  { id: 'okr', name: 'OKR', description: 'Gestión de Objetivos y Resultados Clave', actions: ['Ver', 'Crear', 'Editar', 'Eliminar'] },
  {
    id: 'compras',
    name: 'Compras',
    description: 'Gestión de compras, proveedores e insumos',
    actions: ['Ver', 'Crear Proveedores', 'Editar Proveedores', 'Eliminar Proveedores', 'Asignar Productos'],
  },
  {
    id: 'carwash',
    name: 'Carwash',
    description: 'Control operativo y comisiones de lavado',
    actions: ['Ver', 'Gestionar Servicios', 'Editar Lavado', 'Borrar Lavado', 'Ver Comisiones', 'Ver Reportes'],
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    description: 'Gestión de restaurante, recetas, mesas y pedidos',
    actions: ['Ver', 'Crear', 'Editar', 'Eliminar', 'Gestionar Pedidos', 'Ver Comandas', 'Ver Reportes'],
  },
  {
    id: 'personalizacion',
    name: 'Personalización',
    description: 'Gestión de órdenes de personalización',
    actions: ['Ver', 'Crear', 'Editar', 'Eliminar', 'Avanzar Etapa', 'Registrar Pérdidas', 'Ver Agenda', 'Ver Reportes'],
  },
  {
    id: 'pagos',
    name: 'Pagos',
    description: 'Gestión de cobros, transacciones y suscripciones',
    actions: ['Ver', 'Crear Pagos', 'Reembolsar', 'Gestionar Suscripciones', 'Configurar'],
  },
  {
    id: 'contabilidad',
    name: 'Contabilidad',
    description: 'Contabilidad general, plan de cuentas y reportes',
    actions: [
      'Ver',
      'Plan Contable',
      'Diarios',
      'Asientos',
      'Impuestos',
      'Periodos Fiscales',
      'Reportes',
      'CxC',
      'CxP',
      'Conciliación Bancaria',
      'Cierre Fiscal',
      'Auditoría',
      'Configuración',
    ],
  },
  {
    id: 'vehiculos',
    name: 'Venta de Vehículos',
    description: 'Inventario de vehículos, cotizaciones y documentos',
    actions: ['Ver', 'Crear Vehículos', 'Editar Vehículos', 'Eliminar Vehículos', 'Gestionar Cotizaciones', 'Generar Documentos'],
  },
]

export function actionId(moduleId, action) {
  return `${moduleId}::${action}`
}

export function allActionIds() {
  return PERMISSION_MODULES.flatMap((m) => m.actions.map((a) => actionId(m.id, a)))
}

// Approximate legacy defaults per role
const ROLE_PRESETS = {
  Administrador: 0.51,
  Gerente: 0.36,
  Supervisor: 0.23,
  Cajero: 0.07,
  Vendedor: 0.14,
}

export function buildDefaultMatrix() {
  const ids = allActionIds()
  const matrix = {}
  ids.forEach((id) => {
    matrix[id] = {}
    USER_ROLES.forEach((role) => {
      matrix[id][role] = false
    })
  })

  USER_ROLES.forEach((role) => {
    const count = Math.round(ids.length * ROLE_PRESETS[role])
    ids.slice(0, count).forEach((id) => {
      matrix[id][role] = true
    })
  })

  ;['dashboard::Ver', 'configuracion::Ver', 'configuracion::Gestionar Permisos', 'pos::Ver'].forEach((id) => {
    if (matrix[id]) matrix[id].Administrador = true
  })
  return matrix
}
