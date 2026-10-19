import { describe, expect, it } from 'vitest'
import {
  isSelectableAsSpecialist,
  staffOptionsForBranch,
} from '@/modules/rrhh/lib/staff'

const branchId = 'branch-1'

function employee(partial) {
  return {
    id: 'emp-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    active: true,
    selectableAsSpecialist: true,
    branchIds: [branchId],
    ...partial,
  }
}

describe('especialistas de agenda', () => {
  it('trata como seleccionable a quien no tiene el flag definido', () => {
    expect(isSelectableAsSpecialist(employee({ selectableAsSpecialist: undefined }))).toBe(true)
  })

  it('incluye inactivos en el listado de agenda si siguen marcados como seleccionables', () => {
    const options = staffOptionsForBranch(
      [employee({ id: 'inactive', active: false, firstName: 'Yafreisy', lastName: 'Rodriguez' })],
      branchId,
      { bookableOnly: true },
    )
    expect(options.map((item) => item.id)).toEqual(['inactive'])
  })

  it('omite a quien se desmarcó manualmente como especialista', () => {
    const options = staffOptionsForBranch(
      [employee({ selectableAsSpecialist: false })],
      branchId,
      { bookableOnly: true },
    )
    expect(options).toEqual([])
  })
})
