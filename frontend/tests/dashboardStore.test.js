import { beforeEach, describe, expect, it } from 'vitest'
import { useDashboardStore } from '@/stores/dashboardStore'

describe('dashboardStore session scope', () => {
  beforeEach(() => {
    useDashboardStore.getState().clearSensitive()
  })

  it('resetea filtros de sucursal al cambiar de workspace', () => {
    useDashboardStore.setState({
      persistScope: 'workspace-a:user-a',
      branchIds: ['branch-1', 'branch-2', 'branch-3'],
      branchId: 'all',
    })

    useDashboardStore.getState().ensureSessionScope('workspace-b', 'user-a')

    expect(useDashboardStore.getState().persistScope).toBe('workspace-b:user-a')
    expect(useDashboardStore.getState().branchIds).toEqual([])
    expect(useDashboardStore.getState().branchId).toBe('all')
  })

  it('no conserva filtros heredados al asignar el primer scope', () => {
    useDashboardStore.setState({
      persistScope: null,
      branchIds: ['stale-branch'],
      branchId: 'stale-branch',
    })

    useDashboardStore.getState().ensureSessionScope('workspace-a', 'user-a')

    expect(useDashboardStore.getState().persistScope).toBe('workspace-a:user-a')
    expect(useDashboardStore.getState().branchIds).toEqual([])
    expect(useDashboardStore.getState().branchId).toBe('all')
  })
})
