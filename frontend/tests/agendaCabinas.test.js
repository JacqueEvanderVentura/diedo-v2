import { describe, expect, it, vi } from 'vitest'
import {
  ACL_LABELS,
  accessButtonClass,
  accessPillClass,
  aclPatchItems,
  canBookResource,
  canEditResource,
  cycleResourceAccess,
  aclRowsToMap,
  fetchAllActiveUsers,
  FULL_ACCESS_LABEL,
  normalizeAclUserId,
  onlineBookingLabel,
  sortResources,
  userAssignedToBranch,
  userHasAnyGrant,
} from '@/modules/configuracion/lib/agendaCabinas'
import { mapAppointmentResourceFromApi } from '@/services/adapters/appointments'
import { boundsForDate } from '@/modules/agenda/lib/branchOpeningHours'

describe('agendaCabinas helpers', () => {
  it('cycles acl states through four levels', () => {
    expect(cycleResourceAccess(null)).toBe('view')
    expect(cycleResourceAccess('view')).toBe('use')
    expect(cycleResourceAccess('use')).toBe('edit')
    expect(cycleResourceAccess('edit')).toBe(null)
  })

  it('styles access buttons and pills', () => {
    expect(accessButtonClass('edit')).toContain('amber')
    expect(accessButtonClass('use')).toContain('emerald')
    expect(accessButtonClass('view')).toContain('blue')
    expect(accessPillClass('edit')).toContain('amber')
  })

  it('distinguishes book vs edit capability', () => {
    expect(canBookResource('view')).toBe(false)
    expect(canBookResource('use')).toBe(true)
    expect(canEditResource('use')).toBe(false)
    expect(canEditResource('edit')).toBe(true)
  })

  it('sorts resources by sortOrder', () => {
    const sorted = sortResources([
      { id: 'b', name: 'B', sortOrder: 2 },
      { id: 'a', name: 'A', sortOrder: 1 },
    ])
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('exposes acl labels', () => {
    expect(ACL_LABELS.none).toBe('Sin Acceso')
    expect(ACL_LABELS.edit).toBe('Usar y Editar')
  })

  it('normalizes acl row keys and access values', () => {
    const map = aclRowsToMap([
      { user_id: 'AbC-111', access: 'use' },
      { userId: 'def-222', access: 'edit' },
    ])
    expect(map[normalizeAclUserId('abc-111')]).toBe('use')
    expect(map[normalizeAclUserId('def-222')]).toBe('edit')
  })

  it('patches a single acl user without replacing the matrix', () => {
    expect(aclPatchItems('user-1', 'use')).toEqual([{ userId: 'user-1', access: 'use' }])
    expect(aclPatchItems('user-1', null)).toEqual([{ userId: 'user-1', access: null }])
    expect(aclPatchItems(null, 'view')).toEqual([])
  })

  it('matches users assigned to a branch via branches or branchIds', () => {
    expect(userAssignedToBranch({ branches: [{ id: 'hq' }] }, 'hq')).toBe(true)
    expect(userAssignedToBranch({ branchIds: ['hq'] }, 'hq')).toBe(true)
    expect(userAssignedToBranch({ branches: [], branchIds: [] }, 'hq')).toBe(false)
  })

  it('detects users restricted by at least one cabin grant', () => {
    const acl = { cab1: { 'abc-111': 'use' }, cab2: {} }
    expect(userHasAnyGrant(acl, 'ABC-111')).toBe(true)
    expect(userHasAnyGrant(acl, 'def-222')).toBe(false)
    expect(userHasAnyGrant({}, 'abc-111')).toBe(false)
    expect(userHasAnyGrant(acl, null)).toBe(false)
    expect(FULL_ACCESS_LABEL).toBe('Acceso total')
  })

  it('labels and maps the online booking switch per cabin', () => {
    expect(onlineBookingLabel(true)).toBe('Permitida')
    expect(onlineBookingLabel(false)).toBe('Bloqueada')
    expect(mapAppointmentResourceFromApi({ id: 'c', name: 'C' }, 'hq').onlineBookingEnabled).toBe(true)
    expect(
      mapAppointmentResourceFromApi({ id: 'c', name: 'C', onlineBookingEnabled: false }, 'hq')
        .onlineBookingEnabled,
    ).toBe(false)
  })

  it('paginates active users with pageSize 100', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ items: [{ userId: 'a' }], totalPages: 2 })
      .mockResolvedValueOnce({ items: [{ userId: 'b' }], totalPages: 2 })
    const items = await fetchAllActiveUsers({ list })
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[0][0]).toMatchObject({ page: 1, pageSize: 100, status: 'active' })
    expect(items).toHaveLength(2)
  })
})

describe('branchOpeningHours', () => {
  it('uses configured day bounds', () => {
    const bounds = boundsForDate(
      [{ weekday: 'mon', opensAt: '09:00', closesAt: '18:00' }],
      '2026-09-14',
    )
    expect(bounds.startHour).toBe(9)
    expect(bounds.endHour).toBe(18)
    expect(bounds.closed).toBe(false)
  })

  it('falls back when no hours configured', () => {
    const bounds = boundsForDate([], '2026-09-14')
    expect(bounds.startHour).toBe(8)
    expect(bounds.endHour).toBe(20)
  })
})
