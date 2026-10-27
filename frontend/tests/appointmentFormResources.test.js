import { describe, expect, it } from 'vitest'
import {
  appointmentScheduleChanged,
  resolveAppointmentAssignment,
  resolveAppointmentFormResources,
  resolveNextCabinaId,
} from '@/modules/agenda/lib/appointmentFormResources'

const BRANCH = 'branch-1'
const CABINA_1 = 'cab-1'
const CABINA_2 = 'cab-2'

const viewOnly = [
  { id: CABINA_1, name: 'Cabina 1', branchId: BRANCH, access: 'view', active: true, sortOrder: 1 },
  { id: CABINA_2, name: 'Cabina 2', branchId: BRANCH, access: 'view', active: true, sortOrder: 2 },
]

const editable = [
  { id: CABINA_2, name: 'Cabina 2', branchId: BRANCH, access: 'edit', active: true, sortOrder: 2 },
  { id: CABINA_1, name: 'Cabina 1', branchId: BRANCH, access: 'edit', active: true, sortOrder: 1 },
  { id: 'cab-x', name: 'Otra sucursal', branchId: 'branch-2', access: 'edit', active: true, sortOrder: 0 },
]

describe('resolveAppointmentFormResources', () => {
  it('includes the assigned view-only cabin so the select can show its name', () => {
    const options = resolveAppointmentFormResources({
      resources: viewOnly,
      branchId: BRANCH,
      currentCabinaId: CABINA_1,
    })
    expect(options.map((resource) => resource.id)).toEqual([CABINA_1])
    expect(options[0].name).toBe('Cabina 1')
  })

  it('lists edit grants as bookable, sorted, and scoped to the branch', () => {
    const options = resolveAppointmentFormResources({ resources: editable, branchId: BRANCH })
    expect(options.map((resource) => resource.id)).toEqual([CABINA_1, CABINA_2])
  })

  it('keeps a stub when the assigned cabin is missing from the store', () => {
    const options = resolveAppointmentFormResources({
      resources: viewOnly,
      branchId: BRANCH,
      currentCabinaId: 'orphan-cabin',
    })
    expect(options[0]).toMatchObject({ id: 'orphan-cabin', name: 'Cabina asignada' })
  })

  it('does not borrow a cabin from another branch', () => {
    const options = resolveAppointmentFormResources({
      resources: editable,
      branchId: BRANCH,
      currentCabinaId: 'cab-x',
    })
    expect(options[0]).toMatchObject({ id: 'cab-x', name: 'Cabina asignada' })
  })

  it('does not invent bookable cabins when ACL is view-only and nothing is assigned', () => {
    expect(
      resolveAppointmentFormResources({
        resources: viewOnly,
        branchId: BRANCH,
        currentCabinaId: '',
      }),
    ).toEqual([])
  })
})

describe('resolveNextCabinaId', () => {
  it('never rewrites the cabin while editing, even without bookable options', () => {
    expect(
      resolveNextCabinaId({ isEditing: true, employeeSelected: false, formCabinaId: CABINA_1, options: [] }),
    ).toBe(CABINA_1)
    expect(
      resolveNextCabinaId({
        isEditing: true,
        employeeSelected: true,
        formCabinaId: CABINA_2,
        options: [{ id: CABINA_1, access: 'edit' }],
      }),
    ).toBe(CABINA_2)
  })

  it('keeps an orphan appointment without cabin while editing', () => {
    expect(
      resolveNextCabinaId({
        isEditing: true,
        employeeSelected: false,
        formCabinaId: '',
        options: [{ id: CABINA_1, access: 'edit' }],
      }),
    ).toBe('')
  })

  it('picks the first bookable cabin only for a new appointment with an employee', () => {
    const options = [
      { id: CABINA_1, access: 'view' },
      { id: CABINA_2, access: 'use' },
    ]
    expect(
      resolveNextCabinaId({ isEditing: false, employeeSelected: true, formCabinaId: '', options }),
    ).toBe(CABINA_2)
    expect(
      resolveNextCabinaId({ isEditing: false, employeeSelected: false, formCabinaId: '', options }),
    ).toBe('')
  })

  it('keeps a valid manual choice on a new appointment', () => {
    expect(
      resolveNextCabinaId({
        isEditing: false,
        employeeSelected: true,
        formCabinaId: CABINA_2,
        options: [{ id: CABINA_1, access: 'edit' }, { id: CABINA_2, access: 'edit' }],
      }),
    ).toBe(CABINA_2)
  })
})

describe('resolveAppointmentAssignment', () => {
  it('uses cualquiera disponible only when creating without an employee', () => {
    expect(resolveAppointmentAssignment({ isEditing: false, employeeId: '', cabinaId: CABINA_1 })).toEqual({
      employeeId: '',
      cabinaId: '',
      anyAvailable: true,
    })
  })

  it('keeps the cabin when saving an appointment that has no employee', () => {
    expect(resolveAppointmentAssignment({ isEditing: true, employeeId: '', cabinaId: CABINA_1 })).toEqual({
      employeeId: '',
      cabinaId: CABINA_1,
      anyAvailable: false,
    })
  })

  it('keeps employee and cabin on a new appointment with an employee', () => {
    expect(resolveAppointmentAssignment({ isEditing: false, employeeId: 'emp-1', cabinaId: CABINA_2 })).toEqual({
      employeeId: 'emp-1',
      cabinaId: CABINA_2,
      anyAvailable: false,
    })
  })
})

describe('appointmentScheduleChanged', () => {
  const original = {
    branchId: BRANCH,
    date: '2026-10-22',
    time: '08:00',
    duration: 30,
    employeeId: '',
    cabinaId: CABINA_1,
  }

  it('treats notes or status edits as unchanged schedule', () => {
    expect(appointmentScheduleChanged(original, { ...original, duration: '30', notes: 'x', status: 'cancelada' })).toBe(false)
  })

  it('detects time or cabin moves and new appointments', () => {
    expect(appointmentScheduleChanged(original, { ...original, time: '08:30' })).toBe(true)
    expect(appointmentScheduleChanged(original, { ...original, cabinaId: CABINA_2 })).toBe(true)
    expect(appointmentScheduleChanged(null, original)).toBe(true)
  })
})
