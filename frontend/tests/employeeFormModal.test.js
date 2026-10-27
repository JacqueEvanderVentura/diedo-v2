import { describe, expect, it } from 'vitest'
import { createEmployeeFormState } from '@/modules/rrhh/components/EmployeeFormModal'

describe('formulario de empleados', () => {
  it('no mezcla la sucursal demo con sucursales UUID al crear en modo API', () => {
    const form = createEmployeeFormState()

    expect(form.branchIds).toEqual([])
    expect(form.branchIds).not.toContain('charm-dn')
    expect(form.selectableAsSpecialist).toBe(true)
  })

  it('conserva únicamente las sucursales del empleado al editar', () => {
    const form = createEmployeeFormState({
      id: 'employee-1',
      branchIds: ['01a03144-dff3-70d8-aedc-70a77395c0a2'],
    })

    expect(form.branchIds).toEqual(['01a03144-dff3-70d8-aedc-70a77395c0a2'])
  })

  it('formatea la cédula y deja salario/residencia para la ficha HR', () => {
    const form = createEmployeeFormState({
      id: 'employee-1',
      documentId: '00112345678',
      residenceLocation: 'Santo Domingo, DN',
      salary: 42000,
    })

    expect(form.documentId).toBe('001-1234567-8')
    expect(form.residenceLocation).toBe('Santo Domingo, DN')
    expect(form.salary).toBe('42000')
  })
})
