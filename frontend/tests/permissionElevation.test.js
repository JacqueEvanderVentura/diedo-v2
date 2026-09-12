import { describe, expect, it } from 'vitest'
import {
  buildDemoElevation,
  isDemoGatedPermission,
  resolveDemoApproverPermissions,
} from '@/lib/permissionElevation'
import { DEMO_SNAPSHOT } from '@/data/generated/demoSnapshot'

describe('elevación de permisos', () => {
  it('marca anular factura como permiso con elevación en demo', () => {
    expect(isDemoGatedPermission('sales.invoice.void')).toBe(true)
    expect(isDemoGatedPermission('pos.sell')).toBe(false)
  })

  it('resuelve permisos del supervisor demo', () => {
    const permissions = resolveDemoApproverPermissions(
      'demo.luz.supervisor@example.com',
      DEMO_SNAPSHOT
    )
    expect(permissions).toContain('sales.invoice.void')
  })

  it('construye elevación temporal con códigos del supervisor', () => {
    const elevation = buildDemoElevation({
      approverName: 'Luz Supervisor',
      approverPermissions: ['sales.invoice.void', 'pos.read'],
    })
    expect(elevation.grantedByName).toBe('Luz Supervisor')
    expect(elevation.effectivePermissionCodes).toContain('sales.invoice.void')
    expect(new Date(elevation.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})
