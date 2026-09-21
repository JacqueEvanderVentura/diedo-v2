import { describe, expect, it } from 'vitest'
import {
  isCrmSidebarItemActive,
  isSimplifiedBlockedCrmPath,
  isSimplifiedCrmModulePath,
  isStandardCrmPath,
  resolveCrmNavGroup,
  resolveSimplifiedCrmSection,
  SIMPLIFIED_CRM_SECTIONS,
} from '@/modules/crm/lib/crmNavigation'

const CRM_GROUP = {
  id: 'crm',
  label: 'CRM',
  children: [
    { label: 'Overview', to: '/crm' },
    { label: 'Leads', to: '/crm/leads' },
  ],
}

describe('crmNavigation', () => {
  it('detects standard CRM routes', () => {
    expect(isStandardCrmPath('/crm/leads')).toBe(true)
    expect(isStandardCrmPath('/crm/workspace')).toBe(false)
  })

  it('allows ventas in simplified mode', () => {
    expect(isStandardCrmPath('/crm/ventas')).toBe(false)
    expect(isSimplifiedBlockedCrmPath('/crm/ventas')).toBe(false)
    expect(isSimplifiedBlockedCrmPath('/crm/leads')).toBe(true)
    expect(isSimplifiedCrmModulePath('/crm/ventas')).toBe(true)
    expect(isSimplifiedCrmModulePath('/crm/workspace')).toBe(true)
    expect(isSimplifiedCrmModulePath('/crm/leads')).toBe(false)
  })

  it('links CRM directly to workspace in simplified mode', () => {
    const simplified = resolveCrmNavGroup(CRM_GROUP, 'simplified')
    expect(simplified.children).toBeUndefined()
    expect(simplified.to).toBe('/crm/workspace')
  })

  it('marks simplified CRM sidebar active on workspace and ventas', () => {
    const item = { id: 'crm', to: '/crm/workspace' }
    expect(isCrmSidebarItemActive(item, '/crm/ventas', 'simplified')).toBe(true)
    expect(isCrmSidebarItemActive(item, '/crm/workspace', 'simplified')).toBe(true)
    expect(isCrmSidebarItemActive(item, '/crm/leads', 'simplified')).toBe(false)
  })

  it('resolves simplified workspace sections from the URL', () => {
    expect(resolveSimplifiedCrmSection('/crm/workspace', '')).toBe('prospectos')
    expect(resolveSimplifiedCrmSection('/crm/workspace', '?section=clientes')).toBe('clientes')
    expect(resolveSimplifiedCrmSection('/crm/ventas', '')).toBe('ventas')
  })

  it('defines ventas section link to /crm/ventas', () => {
    const ventas = SIMPLIFIED_CRM_SECTIONS.find((section) => section.id === 'ventas')
    expect(ventas?.to).toBe('/crm/ventas')
    expect(ventas?.testId).toBe('crm-simplified-section-ventas')
    const clientes = SIMPLIFIED_CRM_SECTIONS.find((section) => section.id === 'clientes')
    expect(clientes?.to).toBe('/crm/workspace?section=clientes')
  })
})
