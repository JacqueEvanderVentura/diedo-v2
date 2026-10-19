import { describe, expect, it } from 'vitest'
import { isAgendaBookable, isPosSellable } from '@/stores/catalogStore'

describe('canales de servicio en catálogo', () => {
  const service = { id: 'svc-1', type: 'service' }

  it('permite agenda y venta por defecto', () => {
    expect(isAgendaBookable(service)).toBe(true)
    expect(isPosSellable(service)).toBe(true)
  })

  it('respeta flags solo agenda o solo venta', () => {
    expect(isAgendaBookable({ ...service, availableInAgenda: true, availableInPos: false })).toBe(true)
    expect(isPosSellable({ ...service, availableInAgenda: true, availableInPos: false })).toBe(false)
    expect(isAgendaBookable({ ...service, availableInAgenda: false, availableInPos: true })).toBe(false)
    expect(isPosSellable({ ...service, availableInAgenda: false, availableInPos: true })).toBe(true)
  })

  it('no aplica flags a productos', () => {
    const product = { id: 'p-1', type: 'product', availableInAgenda: false, availableInPos: false }
    expect(isAgendaBookable(product)).toBe(false)
    expect(isPosSellable(product)).toBe(true)
  })
})
