import { describe, expect, it } from 'vitest'
import { formatLeadStageMoveTitle, isLeadStageMoveActivity } from '@/modules/crm/lib/leadStageLabels'

describe('leadStageLabels', () => {
  it('formats simplified stage move titles', () => {
    expect(formatLeadStageMoveTitle('nuevo', 'propuesta')).toBe('Movido de Nuevo a Interesado')
  })

  it('detects stage move activities by title', () => {
    expect(isLeadStageMoveActivity({ title: 'Movido de Nuevo a Interesado' })).toBe(true)
    expect(isLeadStageMoveActivity({ title: 'Llamada de seguimiento' })).toBe(false)
  })
})
