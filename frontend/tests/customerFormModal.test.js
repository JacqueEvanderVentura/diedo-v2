import { describe, expect, it } from 'vitest'
import {
  createCustomerFormState,
  toggleCustomerBranch,
} from '@/modules/crm/components/CustomerFormModal'

describe('formulario de clientes CRM', () => {
  it('inicia como consumidor y obliga a seleccionar las sucursales explícitamente', () => {
    const form = createCustomerFormState()

    expect(form.customerType).toBe('b2c')
    expect(form.branchIds).toEqual([])
  })

  it('conserva el tipo empresa y todas las sucursales al editar', () => {
    const form = createCustomerFormState({
      name: 'Grupo Acme',
      company: 'Grupo Acme, S.R.L.',
      customerType: 'b2b',
      branchId: 'branch-main',
      branchIds: ['branch-main', 'branch-north'],
    })

    expect(form).toMatchObject({
      customerType: 'b2b',
      company: 'Grupo Acme, S.R.L.',
      branchIds: ['branch-main', 'branch-north'],
    })
  })

  it('permite agregar y retirar sucursales sin duplicarlas', () => {
    const assigned = toggleCustomerBranch(['branch-main'], 'branch-north')

    expect(assigned).toEqual(['branch-main', 'branch-north'])
    expect(toggleCustomerBranch(assigned, 'branch-main')).toEqual(['branch-north'])
  })
})
