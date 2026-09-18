const STANDARD_CRM_PREFIXES = [
  '/crm/clientes',
  '/crm/leads',
  '/crm/pipeline',
  '/crm/seguimiento',
  '/crm/cotizaciones',
  '/crm/compras',
  '/crm/ventas',
]

export function isStandardCrmPath(pathname) {
  if (pathname === '/crm' || pathname === '/crm/') return true
  return STANDARD_CRM_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
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
