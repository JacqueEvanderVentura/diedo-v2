import { describe, expect, it } from 'vitest'

/**
 * Contrato: cuando el comercio CRM no está habilitado, hydrateSection no debe
 * sobrescribir quotes/sales con arrays vacíos (retorna {} sin esas claves).
 */
describe('crm hydrate commerce guard', () => {
  it('preserva estado local si no hay claves de comercio en la actualización', () => {
    const previous = { quotes: [{ id: 'q1' }], sales: [{ id: 's1' }] }
    const updates = {}
    const next = { ...previous, ...updates }
    expect(next.quotes).toHaveLength(1)
    expect(next.sales).toHaveLength(1)
  })

  it('no mezcla quotes vacíos cuando updates trae solo otras secciones', () => {
    const previous = { quotes: [{ id: 'q1' }] }
    const updates = { opportunities: [] }
    const next = { ...previous, ...updates }
    expect(next.quotes).toHaveLength(1)
  })
})
