import { describe, expect, it } from 'vitest'
import { isStandardCrmPath, resolveCrmNavGroup } from '@/modules/crm/lib/crmNavigation'

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

  it('links CRM directly to workspace in simplified mode', () => {
    const simplified = resolveCrmNavGroup(CRM_GROUP, 'simplified')
    expect(simplified.children).toBeUndefined()
    expect(simplified.to).toBe('/crm/workspace')
  })
})
