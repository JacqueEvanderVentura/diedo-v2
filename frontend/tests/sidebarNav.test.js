import { describe, expect, it } from 'vitest'
import { BACKOFFICE_NAV_ITEMS } from '@/data/navigation'
import { deriveOpenNavGroups } from '@/lib/sidebarNav'

function isFlatNavItemActive(item, pathname) {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

describe('sidebarNav', () => {
  const resumen = BACKOFFICE_NAV_ITEMS.find((i) => i.id === 'backoffice-resumen')
  const companias = BACKOFFICE_NAV_ITEMS.find((i) => i.id === 'backoffice-companias')

  it('does not treat backoffice items as expandable groups', () => {
    expect(deriveOpenNavGroups(BACKOFFICE_NAV_ITEMS, '/backoffice/companias')).toEqual({})
  })

  it('activates Resumen only on /backoffice', () => {
    expect(isFlatNavItemActive(resumen, '/backoffice')).toBe(true)
    expect(isFlatNavItemActive(resumen, '/backoffice/companias')).toBe(false)
    expect(isFlatNavItemActive(resumen, '/backoffice/usuarios')).toBe(false)
  })

  it('activates Compañías on list and detail routes', () => {
    expect(isFlatNavItemActive(companias, '/backoffice/companias')).toBe(true)
    expect(isFlatNavItemActive(companias, '/backoffice/companias/ws-1')).toBe(true)
  })
})
