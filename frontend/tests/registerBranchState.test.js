import { describe, expect, it } from 'vitest'
import {
  emptyRegisterView,
  isOnlineBranchId,
  pickRegisterSnapshot,
  resolveBranchRegisterOpen,
} from '@/modules/pos/lib/registerBranchState'

describe('registerBranchState', () => {
  it('detects online branch ids', () => {
    expect(isOnlineBranchId('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(isOnlineBranchId('charm-dn')).toBe(false)
  })

  it('captures register snapshot per branch', () => {
    const snapshot = pickRegisterSnapshot({
      cajaBranchId: 'charm-dn',
      register: { open: true, openingCash: 1000 },
      cashSales: 250,
      shiftSales: [{ id: 'sale-1' }],
      shiftIncomes: [],
      expenses: [],
      registerSummary: { totalSales: 250 },
      lastCloseSummary: null,
      pagination: {},
    })

    expect(snapshot.register.branchId).toBe('charm-dn')
    expect(snapshot.cashSales).toBe(250)
    expect(snapshot.shiftSales).toHaveLength(1)
  })

  it('creates an empty register view for a new branch', () => {
    expect(emptyRegisterView('charm-santiago')).toMatchObject({
      register: { open: false, branchId: 'charm-santiago' },
      shiftSales: [],
    })
  })

  it('detects open registers per POS branch, not the last caja branch viewed', () => {
    const state = {
      branchId: 'charm-dn',
      cajaBranchId: 'charm-santiago',
      register: { open: true, branchId: 'charm-santiago' },
      registerByBranch: {
        'charm-dn': { register: { open: false, branchId: 'charm-dn' } },
        'charm-santiago': { register: { open: true, branchId: 'charm-santiago' } },
        'charm-este': { register: { open: false, branchId: 'charm-este' } },
      },
    }

    expect(resolveBranchRegisterOpen(state, 'charm-dn')).toBe(false)
    expect(resolveBranchRegisterOpen(state, 'charm-santiago')).toBe(true)
    expect(resolveBranchRegisterOpen(state, 'charm-este')).toBe(false)
    expect(resolveBranchRegisterOpen({
      ...state,
      register: { open: false, branchId: 'charm-dn' },
      cajaBranchId: 'charm-dn',
    }, 'charm-dn')).toBe(false)
  })
})
