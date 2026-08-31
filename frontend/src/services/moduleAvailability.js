const API_CONNECTED_MODULE_SET = new Set([
  'foundation',
  'iam',
  'catalog',
  'crm',
  'hr',
  'appointments',
  'purchasing',
])

export const API_CONNECTED_MODULES = Object.freeze([...API_CONNECTED_MODULE_SET])

export function isApiConnectedModule(moduleCode) {
  return Boolean(moduleCode && API_CONNECTED_MODULE_SET.has(moduleCode))
}

export function isModuleAvailable(moduleCode, enabledModules = []) {
  if (!moduleCode || !isApiConnectedModule(moduleCode)) return true
  const enabled = enabledModules instanceof Set ? enabledModules : new Set(enabledModules)
  return enabled.has(moduleCode)
}

export function routeRequirement(pathname) {
  if (pathname === '/compras' || pathname.startsWith('/compras/')) {
    return { module: 'purchasing', permission: 'purchasing.read' }
  }
  if (pathname === '/agenda' || pathname.startsWith('/agenda/')) {
    return { module: 'appointments', permission: 'appointment.read' }
  }
  if (pathname.startsWith('/rrhh/cuentas-por-cobrar')) {
    return { module: 'hr', permission: 'hr.debt.read' }
  }
  if (pathname.startsWith('/rrhh/documentos')) {
    return { module: 'hr', permission: 'hr.document.read' }
  }
  if (pathname.startsWith('/rrhh/solicitudes')) {
    return { module: 'hr', permission: 'hr.leave.request' }
  }
  if (pathname.startsWith('/crm/clientes')) {
    return { module: 'crm', permission: 'customer.read' }
  }
  if (pathname.startsWith('/rrhh/directorio')) {
    return { module: 'hr', permission: 'employee.read' }
  }
  if (pathname === '/rrhh') {
    return { module: 'hr', permission: 'hr.overview.read' }
  }
  if (pathname.startsWith('/configuracion/usuarios')) {
    return { module: 'iam', permission: 'membership.read' }
  }
  if (pathname.startsWith('/configuracion/permisos')) {
    return { module: 'iam', permission: 'role.read' }
  }
  if (pathname.startsWith('/configuracion/categorias')) {
    return { module: 'catalog', permission: 'catalog.read' }
  }
  if (pathname.startsWith('/configuracion/sucursales')) {
    return { module: 'foundation', permission: 'branch.read' }
  }
  if (pathname.startsWith('/configuracion')) {
    return { module: 'foundation', permission: 'workspace.read' }
  }
  if (pathname.startsWith('/inventarios')) {
    return { module: 'catalog', permission: 'catalog.read' }
  }
  if (pathname.startsWith('/dashboard')) {
    return { module: 'foundation', permission: 'workspace.read' }
  }
  return null
}
