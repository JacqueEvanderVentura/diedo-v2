import { describe, expect, it } from 'vitest'
import { customersAtBranch, customersVisibleToSession, customerActiveAtBranch } from '@/lib/customerScope'

const customers = [
  { id: 'walk-in', isDefault: true, branchIds: ['charm-dn'] },
  { id: 'c-dn', name: 'Cliente DN', branchIds: ['charm-dn'] },
  { id: 'c-stg', name: 'Cliente Santiago', branchIds: ['charm-santiago'] },
  { id: 'c-both', name: 'Cliente multi', branchIds: ['charm-dn', 'charm-santiago'] },
]

describe('customerScope', () => {
  it('muestra solo clientes de las sucursales del usuario', () => {
    const visible = customersVisibleToSession(customers, { branchIds: ['charm-dn'] })
    expect(visible.map((item) => item.id)).toEqual(['walk-in', 'c-dn', 'c-both'])
  })

  it('no oculta clientes cuando el usuario no tiene sucursales limitadas', () => {
    expect(customersVisibleToSession(customers, { branchIds: [] })).toEqual(customers)
  })

  it('filtra clientes por sucursal operativa del POS', () => {
    expect(customersAtBranch(customers, 'charm-santiago').map((item) => item.id)).toEqual([
      'c-stg',
      'c-both',
    ])
    expect(customerActiveAtBranch(customers[2], 'charm-dn')).toBe(false)
    expect(customerActiveAtBranch(customers[3], 'charm-dn')).toBe(true)
  })
})
