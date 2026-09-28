import { describe, expect, it } from 'vitest'
import { previewData, PREVIEW_COMMISSIONS, PREVIEW_WASHES } from '@/modules/carwash/data/preview'
import { filterPreviewCommissions, filterPreviewWashes, resolveCarwashScope } from '@/modules/carwash/lib/navigation'

describe('Carwash phase 0 boundaries', () => {
  it('never returns synthetic records for a connected or inaccessible branch', () => {
    for (const values of [
      { isDemo: false, populated: true, branchId: 'charm-dn' },
      { isDemo: true, populated: true, branchId: 'unknown' },
      { isDemo: true, populated: false, branchId: 'charm-dn' },
    ]) {
      expect(previewData(values)).toEqual({ washes: [], commissions: [], services: [], employees: [] })
    }
    expect(previewData({ isDemo: true, populated: true, branchId: 'charm-dn' }).washes).toHaveLength(3)
  })

  it('rejects inaccessible URL tabs and branches before rendering', () => {
    const branches = [{ id: 'allowed' }, { id: 'other-allowed' }]
    const params = new URLSearchParams('tab=comisiones&branchId=another-workspace')
    const canReadOnly = (permission) => permission === 'carwash.read'
    expect(resolveCarwashScope(params, branches, canReadOnly, 'other-allowed')).toEqual({ tab: 'operativo', branchId: 'other-allowed' })
    expect(resolveCarwashScope(params, [], canReadOnly, 'allowed')).toEqual({ tab: 'operativo', branchId: '' })
    expect(resolveCarwashScope(new URLSearchParams('tab=unknown&branchId=allowed'), branches, () => true, null)).toEqual({ tab: 'operativo', branchId: 'allowed' })
  })

  it('filters operational examples by plate, state and either employee role', () => {
    expect(filterPreviewWashes(PREVIEW_WASHES, new URLSearchParams('search=demo-003&washStatus=completed&employeeId=cw-demo-sam')).map((item) => item.id)).toEqual(['cw-demo-003'])
    expect(filterPreviewWashes(PREVIEW_WASHES, new URLSearchParams('search=unknown'))).toEqual([])
    expect(filterPreviewWashes(PREVIEW_WASHES, new URLSearchParams('employeeId=cw-demo-sam'))).toHaveLength(3)
  })

  it('keeps both roles for one beneficiary and filters status/date independently', () => {
    const filtered = filterPreviewCommissions(PREVIEW_COMMISSIONS, new URLSearchParams('employeeId=cw-demo-sam&commissionStatus=pending&dateFrom=2026-09-28&dateTo=2026-09-28'))
    expect(filtered.map((item) => item.role)).toEqual(['washer', 'supervisor'])
    expect(filtered.reduce((total, row) => total + Number(row.amount), 0)).toBe(125)
    expect(new Set(filtered.map((item) => item.washId)).size).toBe(1)
    expect(filterPreviewCommissions(PREVIEW_COMMISSIONS, new URLSearchParams('dateFrom=2026-09-29&dateTo=2026-09-28'))).toEqual([])
  })
})
