import { describe, expect, it } from 'vitest'

import {
  buildImportStackGroups,
  IMPORT_STACK_NOTE_MARKER,
  importStackSiblings,
  isImportStackedAppointment,
} from '@/modules/agenda/lib/importStacked'

describe('importStacked', () => {
  it('groups imported appointments that share cabina and schedule', () => {
    const note = `${IMPORT_STACK_NOTE_MARKER} en el mismo horario`
    const a = {
      id: '1',
      resourceId: 'cab-1',
      date: '2026-11-15',
      time: '10:00',
      notes: note,
      customerName: 'Ana',
    }
    const b = { ...a, id: '2', customerName: 'Luis' }
    const groups = buildImportStackGroups([a, b])
    expect(groups.size).toBe(1)
    expect(importStackSiblings([a, b], a)).toHaveLength(2)
    expect(isImportStackedAppointment(a)).toBe(true)
  })
})
