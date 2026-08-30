import { describe, expect, it } from 'vitest'
import { DemoRepository } from '@/services/demoRepository'
import { DEMO_SNAPSHOT } from '@/data/generated/demoSnapshot'

describe('DemoRepository', () => {
  it('expone la misma versión y conteos del snapshot canónico generado', () => {
    const repository = new DemoRepository(DEMO_SNAPSHOT)

    expect(repository.seedVersion).toBe('v1')
    expect(repository.branches()).toHaveLength(3)
    expect(repository.paymentMethods()).toHaveLength(3)
    expect(repository.users()).toHaveLength(8)
    expect(repository.customers()).toHaveLength(5)
    expect(repository.employees()).toHaveLength(13)
    expect(repository.catalog().categories).toHaveLength(6)
    expect(repository.catalog().items).toHaveLength(22)
    const productsByBranch = Object.fromEntries(
      ['HQ', 'NORTH', 'DOWNTOWN', 'EAST'].map((branchCode) => [
        branchCode,
        repository.catalog().items.filter(
          (item) => item.itemType === 'product' && item.branchCodes.includes(branchCode)
        ).length,
      ])
    )
    expect(productsByBranch).toEqual({ HQ: 6, NORTH: 4, DOWNTOWN: 4, EAST: 4 })
    expect(repository.hr().leaveRequests).toHaveLength(2)
    expect(repository.hr().debts).toHaveLength(2)
    expect(repository.hr().documents).toHaveLength(0)
    expect(repository.session()).toMatchObject({ source: 'demo', seedVersion: 'v1' })
    expect(JSON.stringify(DEMO_SNAPSHOT)).not.toMatch(/password|refreshToken|accessToken/i)
  })
})
