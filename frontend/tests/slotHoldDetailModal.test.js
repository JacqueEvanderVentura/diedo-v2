import { describe, expect, it } from 'vitest'
import { slotHoldCustomerLabel } from '@/modules/agenda/components/booking/SlotHoldDetailModal'
import { unassignedContactLabel } from '@/modules/agenda/lib/slotHoldWhatsApp'

describe('slotHoldCustomerLabel', () => {
  it('prefiere el nombre del apartado', () => {
    expect(slotHoldCustomerLabel({ customerName: 'María López' })).toBe('María López')
  })

  it('indica cuando falta el nombre', () => {
    expect(slotHoldCustomerLabel({ customerId: 'cust-1' })).toContain('identificado')
    expect(slotHoldCustomerLabel({})).toContain('sin identificar')
  })

  it('muestra etiqueta de contacto vacío', () => {
    expect(unassignedContactLabel(null)).toBe('No asignado')
  })
})