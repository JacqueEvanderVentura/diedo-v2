// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { clearPublicSession, rememberPublicSession } from '@/modules/portal/lib/publicSession'
import { getSlotHoldToken, holdTokenForIdentity } from '@/modules/agenda/lib/slotHoldToken'

afterEach(() => {
  clearPublicSession()
  sessionStorage.clear()
})

describe('slotHoldToken', () => {
  it('derives a stable token from branch and document', () => {
    rememberPublicSession({
      branchId: 'branch-abc',
      docType: 'cedula',
      documentId: '402-1202426-5',
    })
    const first = getSlotHoldToken()
    const second = getSlotHoldToken()
    expect(first).toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(8)
    expect(holdTokenForIdentity({
      branchId: 'branch-abc',
      docType: 'cedula',
      documentId: '40212024265',
    })).toBe(first)
  })
})