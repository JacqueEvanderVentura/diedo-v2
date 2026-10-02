import { describe, expect, it } from 'vitest'
import { moduleLabel } from '@/lib/moduleLabels'

describe('moduleLabel', () => {
  it('usa el mismo nombre que el menú del ERP', () => {
    expect(moduleLabel('crm', 'Customer relationship management')).toBe('CRM')
    expect(moduleLabel('pos', 'Point of sale')).toBe('Terminal POS')
    expect(moduleLabel('hr', 'Human resources')).toBe('RRHH')
    expect(moduleLabel('unknown', 'Custom')).toBe('Custom')
  })
})
