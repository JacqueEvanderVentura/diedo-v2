import { describe, expect, it } from 'vitest'
import {
  API_CONNECTED_MODULES,
  isApiConnectedModule,
  isModuleAvailable,
  requiresFinanceData,
  routeRequirement,
} from '@/services/moduleAvailability'

describe('moduleAvailability', () => {
  it('limita por entitlement solamente los módulos conectados a la API', () => {
    const enabled = new Set(['foundation', 'iam', 'catalog', 'crm', 'hr', 'appointments', 'purchasing', 'incidents', 'sales', 'inventory', 'pos', 'finance'])

    expect(API_CONNECTED_MODULES).toEqual([
      'foundation',
      'dashboard',
      'iam',
      'catalog',
      'crm',
      'hr',
      'appointments',
      'purchasing',
      'incidents',
      'sales',
      'pos',
      'finance',
    ])
    expect(isApiConnectedModule('catalog')).toBe(true)
    expect(isModuleAvailable('catalog', enabled)).toBe(true)
    expect(isModuleAvailable('catalog', new Set())).toBe(false)
  })

  it('mantiene disponibles los módulos frontend durante la migración progresiva', () => {
    const enabled = new Set(['foundation', 'iam', 'catalog'])

    for (const moduleCode of [
      'accounting',
      'reporting',
    ]) {
      expect(isModuleAvailable(moduleCode, enabled)).toBe(true)
    }
  })

  it('habilita POS sólo cuando el workspace tiene pos, sales e inventory', () => {
    expect(isModuleAvailable('pos', new Set(['sales', 'inventory', 'pos']))).toBe(true)
    expect(isModuleAvailable('pos', new Set(['sales', 'pos']))).toBe(false)
    expect(isModuleAvailable('pos', new Set(['inventory', 'pos']))).toBe(false)
    expect(isModuleAvailable('pos', new Set(['sales', 'inventory']))).toBe(false)
  })

  it('hidrata finanzas al entrar a sus rutas o a reportes que consumen sus agregados', () => {
    expect(requiresFinanceData('/finanzas')).toBe(true)
    expect(requiresFinanceData('/finanzas/gastos')).toBe(true)
    expect(requiresFinanceData('/reportes/generales')).toBe(true)
    expect(requiresFinanceData('/dashboard')).toBe(false)
  })

  it('solo exige contratos backend en las rutas ya conectadas', () => {
    expect(routeRequirement('/configuracion/usuarios')).toEqual({
      module: 'iam',
      permission: 'membership.read',
    })
    expect(routeRequirement('/inventarios')).toEqual({
      module: 'catalog',
      permission: 'catalog.read',
    })
    expect(routeRequirement('/crm/clientes')).toEqual({
      module: 'crm',
      permission: 'customer.read',
    })
    expect(routeRequirement('/rrhh/directorio')).toEqual({
      module: 'hr',
      permission: 'employee.read',
    })
    expect(routeRequirement('/rrhh')).toEqual({
      module: 'hr',
      permission: 'hr.overview.read',
    })
    expect(routeRequirement('/rrhh/solicitudes')).toEqual({
      module: 'hr',
      permission: 'hr.leave.request',
    })
    expect(routeRequirement('/rrhh/cuentas-por-cobrar')).toEqual({
      module: 'hr',
      permission: 'hr.debt.read',
    })
    expect(routeRequirement('/rrhh/documentos')).toEqual({
      module: 'hr',
      permission: 'hr.document.read',
    })
    expect(routeRequirement('/dashboard')).toEqual({
      module: 'dashboard',
      permission: 'dashboard.read',
    })
    expect(routeRequirement('/compras')).toEqual({
      module: 'purchasing',
      permission: 'purchasing.read',
    })
    expect(routeRequirement('/incidencias')).toEqual({
      module: 'incidents',
      permission: 'incidents.read',
    })
    expect(routeRequirement('/agenda/calendario')).toEqual({
      module: 'appointments',
      permission: 'appointment.read',
    })
    expect(routeRequirement('/agendar')).toBeNull()
    expect(routeRequirement('/pos')).toEqual({
      module: 'pos',
      permission: 'pos.read',
    })
    expect(routeRequirement('/pos/caja')).toEqual({
      module: 'pos',
      permission: 'pos.cash.read',
    })
    expect(routeRequirement('/pos/cuentas-por-cobrar')).toEqual({
      module: 'pos',
      permission: 'pos.receivables.read',
    })
    expect(routeRequirement('/crm/pipeline')).toBeNull()
    expect(routeRequirement('/finanzas')).toEqual({ module: 'finance', permission: 'finance.read' })
  })
})
