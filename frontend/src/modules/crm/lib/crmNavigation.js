const STANDARD_CRM_PREFIXES = [
  '/crm/clientes',
  '/crm/leads',
  '/crm/pipeline',
  '/crm/seguimiento',
  '/crm/cotizaciones',
  '/crm/compras',
]

export const SIMPLIFIED_CRM_SECTIONS = [
  { id: 'prospectos', label: 'Prospectos', to: '/crm/workspace' },
  { id: 'clientes', label: 'Clientes', to: '/crm/workspace?section=clientes' },
  {
    id: 'ventas',
    label: 'Ventas y Facturas',
    to: '/crm/ventas',
    testId: 'crm-simplified-section-ventas',
  },
]

export function isStandardCrmPath(pathname) {
  if (pathname === '/crm' || pathname === '/crm/') return true
  return STANDARD_CRM_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/** Routes hidden in simplified CRM (everything standard except ventas). */
export function isSimplifiedBlockedCrmPath(pathname) {
  return isStandardCrmPath(pathname)
}

export function isSimplifiedCrmModulePath(pathname) {
  if (pathname === '/crm/workspace' || pathname.startsWith('/crm/workspace/')) return true
  if (pathname === '/crm/ventas' || pathname.startsWith('/crm/ventas/')) return true
  return false
}

export function resolveSimplifiedCrmSection(pathname, search = '') {
  if (pathname === '/crm/ventas' || pathname.startsWith('/crm/ventas/')) return 'ventas'
  const section = new URLSearchParams(search).get('section')
  if (section === 'clientes') return 'clientes'
  return 'prospectos'
}

export function isCrmSidebarItemActive(item, pathname, uiMode = 'standard') {
  if (!item || item.id !== 'crm' || uiMode !== 'simplified') {
    if (!item?.to) return false
    return pathname === item.to || pathname.startsWith(`${item.to}/`)
  }
  return isSimplifiedCrmModulePath(pathname)
}

export function resolveCrmNavGroup(group, uiMode = 'standard') {
  if (!group || group.id !== 'crm' || uiMode !== 'simplified') return group
  return {
    id: group.id,
    module: group.module,
    label: group.label,
    icon: group.icon,
    to: '/crm/workspace',
  }
}
