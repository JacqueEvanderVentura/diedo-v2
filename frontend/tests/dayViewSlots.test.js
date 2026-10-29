import { describe, expect, it } from 'vitest'
import {
  activeAppointmentsForResource,
  appointmentsForResource,
  appointmentStartingAtSlot,
  appointmentsOverlappingSlot,
  assignAppointmentLanes,
  calendarResourcesWithUnassigned,
  isSlotBlockedByAppointment,
  calendarBlockHeight,
  calendarRowSpan,
  CALENDAR_ROW_PX,
  UNASSIGNED_RESOURCE_ID,
  slotLaneCount,
} from '@/modules/agenda/lib/dayViewSlots'

const DATE = '2026-09-16'
const CAB = 'cab1'

describe('dayViewSlots', () => {
  const appointments = [
    {
      id: 'a1',
      date: DATE,
      time: '10:00',
      duration: 60,
      cabinaId: CAB,
      status: 'confirmada',
      customerName: 'Pepe',
    },
    {
      id: 'a2',
      date: DATE,
      time: '15:00',
      duration: 60,
      cabinaId: CAB,
      status: 'cancelada',
      customerName: 'Anulada',
    },
  ]

  it('filters active appointments per resource', () => {
    const list = activeAppointmentsForResource(appointments, DATE, CAB)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('a1')
  })

  it('includes cancelled when includeCancelled is true', () => {
    const list = appointmentsForResource(appointments, DATE, CAB, { includeCancelled: true })
    expect(list.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
  })

  it('marks continuation slots as blocked', () => {
    const active = activeAppointmentsForResource(appointments, DATE, CAB)
    expect(appointmentStartingAtSlot(active, '10:00')?.id).toBe('a1')
    expect(appointmentStartingAtSlot(active, '10:30')).toBeNull()
    expect(isSlotBlockedByAppointment(active, '10:30')).toBe(true)
    expect(isSlotBlockedByAppointment(active, '11:00')).toBe(false)
  })

  it('ignores cancelled appointments for blocking', () => {
    const active = activeAppointmentsForResource(appointments, DATE, CAB)
    expect(isSlotBlockedByAppointment(active, '15:00')).toBe(false)
    expect(isSlotBlockedByAppointment(active, '15:30')).toBe(false)
  })

  it('computes row span from duration', () => {
    expect(calendarRowSpan(60)).toBe(2)
    expect(calendarRowSpan(30)).toBe(1)
    expect(calendarRowSpan(90)).toBe(3)
  })

  it('computes proportional block height from duration', () => {
    const contentPx = CALENDAR_ROW_PX - 8
    expect(calendarBlockHeight(30, CALENDAR_ROW_PX)).toBe(contentPx)
    expect(calendarBlockHeight(45, CALENDAR_ROW_PX)).toBe(contentPx * 1.5)
    expect(calendarBlockHeight(60, CALENDAR_ROW_PX)).toBe(contentPx * 2)
  })

  it('lists every appointment that overlaps a slot', () => {
    const active = activeAppointmentsForResource(appointments, DATE, CAB)
    const overlapping = [
      ...active,
      {
        id: 'a3',
        date: DATE,
        time: '10:30',
        duration: 30,
        cabinaId: CAB,
        status: 'confirmada',
        customerName: 'María',
      },
    ]
    const at1030 = appointmentsOverlappingSlot(overlapping, '10:30')
    expect(at1030.map((a) => a.id).sort()).toEqual(['a1', 'a3'])
  })

  it('lists appointments without a cabin in the unassigned column', () => {
    const orphan = {
      id: 'orphan',
      date: DATE,
      time: '08:00',
      duration: 30,
      cabinaId: null,
      status: 'confirmada',
    }
    const assigned = { ...orphan, id: 'assigned', cabinaId: CAB }
    expect(activeAppointmentsForResource([orphan, assigned], DATE, UNASSIGNED_RESOURCE_ID).map((a) => a.id))
      .toEqual(['orphan'])
    expect(activeAppointmentsForResource([orphan, assigned], DATE, CAB).map((a) => a.id)).toEqual(['assigned'])
    const columns = calendarResourcesWithUnassigned([{ id: CAB, name: 'Cabina 1' }], [orphan], DATE)
    expect(columns.map((c) => c.id)).toEqual([CAB, UNASSIGNED_RESOURCE_ID])
  })

  it('omits the unassigned column when every appointment has a cabin or is hidden', () => {
    const resources = [{ id: CAB, name: 'Cabina 1' }]
    const cancelledOrphan = { id: 'c', date: DATE, time: '08:00', duration: 30, cabinaId: '', status: 'cancelada' }
    const otherDay = { ...cancelledOrphan, id: 'd', date: '2026-09-17', status: 'confirmada' }
    expect(calendarResourcesWithUnassigned(resources, [cancelledOrphan, otherDay], DATE)).toBe(resources)
    expect(
      calendarResourcesWithUnassigned(resources, [cancelledOrphan], DATE, { includeCancelled: true }).at(-1)?.id,
    ).toBe(UNASSIGNED_RESOURCE_ID)
  })

  it('assigns separate lanes for overlapping appointments', () => {
    const overlapping = [
      {
        id: 'a1',
        date: DATE,
        time: '10:00',
        duration: 60,
        cabinaId: CAB,
        status: 'confirmada',
      },
      {
        id: 'a3',
        date: DATE,
        time: '10:30',
        duration: 30,
        cabinaId: CAB,
        status: 'confirmada',
      },
    ]
    const { assignment, laneCount } = assignAppointmentLanes(overlapping)
    expect(laneCount).toBe(2)
    expect(assignment.get('a1')).not.toBe(assignment.get('a3'))
  })

  it('scopes lane count to the overlap group instead of the whole column', () => {
    const apt = (id, time, duration) => ({ id, date: DATE, time, duration, cabinaId: CAB, status: 'confirmada' })
    const { assignment, laneCount, laneCountById } = assignAppointmentLanes([
      apt('solo-morning', '08:00', 30),
      apt('pair-a', '10:00', 30),
      apt('pair-b', '10:00', 30),
      apt('solo-afternoon', '14:00', 60),
    ])
    expect(laneCount).toBe(2)
    expect(laneCountById.get('pair-a')).toBe(2)
    expect(laneCountById.get('pair-b')).toBe(2)
    expect(laneCountById.get('solo-morning')).toBe(1)
    expect(laneCountById.get('solo-afternoon')).toBe(1)
    expect(assignment.get('solo-afternoon')).toBe(0)
  })

  it('keeps chained overlaps in one group', () => {
    const apt = (id, time, duration) => ({ id, date: DATE, time, duration, cabinaId: CAB, status: 'confirmada' })
    const { assignment, laneCountById } = assignAppointmentLanes([
      apt('a', '10:00', 60),
      apt('b', '10:30', 60),
      apt('c', '11:00', 60),
      apt('after', '12:00', 30),
    ])
    expect(laneCountById.get('a')).toBe(2)
    expect(laneCountById.get('b')).toBe(2)
    expect(laneCountById.get('c')).toBe(2)
    expect(assignment.get('c')).toBe(assignment.get('a'))
    expect(laneCountById.get('after')).toBe(1)
  })

  it('uses the widest overlap group visible in a slot', () => {
    const laneCountById = new Map([['a', 2], ['b', 1]])
    expect(slotLaneCount([], laneCountById)).toBe(1)
    expect(slotLaneCount([{ id: 'b' }], laneCountById)).toBe(1)
    expect(slotLaneCount([{ id: 'a' }, { id: 'b' }], laneCountById)).toBe(2)
    expect(slotLaneCount([{ id: 'unknown' }], laneCountById)).toBe(1)
  })
})
