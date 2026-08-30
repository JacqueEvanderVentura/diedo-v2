import { describe, expect, it } from 'vitest'
import {
  appointmentPatchToApiPayload,
  appointmentStatusFromApi,
  appointmentStatusToApi,
  appointmentToApiPayload,
  isAppointmentConflict,
  mapAppointmentFromApi,
  mapAppointmentResourceFromApi,
} from '@/services/adapters/appointments'

describe('adaptadores de Agenda', () => {
  it('traduce todos los estados entre el contrato y la UI existente', () => {
    expect(appointmentStatusFromApi('pending')).toBe('pendiente')
    expect(appointmentStatusFromApi('no_show')).toBe('noshow')
    expect(appointmentStatusFromApi('cancelled')).toBe('cancelada')
    expect(appointmentStatusToApi('confirmada')).toBe('confirmed')
    expect(appointmentStatusToApi('reprogramada')).toBe('rescheduled')
  })

  it('mapea referencias, snapshots monetarios y resourceId al modelo visual', () => {
    expect(mapAppointmentFromApi({
      id: 'appointment-1',
      branchId: 'branch-1',
      date: '2026-09-03',
      time: '14:00',
      duration: 60,
      status: 'confirmed',
      version: 3,
      employee: { id: 'employee-1', name: 'Ada' },
      customer: { id: 'customer-1', displayName: 'María Fernández' },
      resource: { id: 'resource-1', code: 'CAB-1', name: 'Cabina 1' },
      serviceName: 'Sesión de terapia',
      price: '2500.00',
    })).toMatchObject({
      id: 'appointment-1',
      employeeId: 'employee-1',
      customerId: 'customer-1',
      customerName: 'María Fernández',
      cabinaId: 'resource-1',
      resourceName: 'Cabina 1',
      status: 'confirmada',
      price: 2500,
      version: 3,
    })

    expect(mapAppointmentResourceFromApi({
      id: 'resource-1',
      branchId: 'branch-1',
      name: 'Cabina 1',
      resourceType: 'room',
      status: 'active',
      version: 2,
    })).toMatchObject({ id: 'resource-1', branchId: 'branch-1', active: true, version: 2 })
  })

  it('construye POST/PATCH versionado y reconoce el 409 de horario', () => {
    const customerId = '01a04f09-32fe-712b-a67a-f0cb64f31431'
    const employeeId = '27c9a3f3-6887-5912-a927-39e1c3109bf1'
    const serviceId = '01a053b5-13dc-7c05-8de8-9830b78282b1'
    const form = {
      branchId: 'branch-1',
      date: '2026-09-03',
      time: '14:00',
      duration: 60,
      customerId,
      customerName: 'María Fernández',
      employeeId,
      cabinaId: 'resource-1',
      serviceId,
      serviceName: 'Sesión de terapia',
      price: 2500,
      status: 'confirmada',
      recurrence: 'weekly',
      repeatCount: 4,
    }

    expect(appointmentToApiPayload(form)).toMatchObject({
      resourceId: 'resource-1',
      customerId,
      employeeId,
      serviceId,
      status: 'confirmed',
      recurrence: 'weekly',
      repeatCount: 4,
    })
    expect(appointmentPatchToApiPayload(form, 7)).toMatchObject({ version: 7, status: 'confirmed' })

    const conflict = Object.assign(new Error('El horario ya está ocupado.'), {
      status: 409,
      parameter: 'time',
    })
    expect(isAppointmentConflict(conflict)).toBe(true)
    expect(isAppointmentConflict(Object.assign(new Error('Versión obsoleta.'), { status: 409, parameter: 'version' }))).toBe(false)
  })

  it('convierte referencias locales o dummy en snapshots sin UUID', () => {
    expect(appointmentToApiPayload({
      branchId: '01a03144-dff3-70d8-aedc-70a77395c0a2',
      resourceId: '01a053b5-13dc-7c05-8de8-9830b78282b1',
      date: '2026-08-30',
      time: '16:00',
      customerId: 'c1',
      employeeId: 'emp-1',
      serviceId: 'p2',
      customerName: 'Juan',
      serviceName: '1 sesión axilas',
      price: 900,
      status: 'pendiente',
      recurrence: 'none',
    })).toMatchObject({
      customerId: null,
      employeeId: null,
      serviceId: null,
      customerName: 'Juan',
      serviceName: '1 sesión axilas',
      price: 900,
    })
  })
})
