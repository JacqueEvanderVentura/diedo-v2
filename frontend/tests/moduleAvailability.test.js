import { describe, expect, it } from 'vitest'
import {
  API_CONNECTED_MODULES,
  isApiConnectedModule,
  isModuleAvailable,
  routeRequirement,
} from '@/services/moduleAvailability'

describe('moduleAvailability', () => {
  it('limita por entitlement solamente los módulos conectados a la API', () => {
    const enabled = new Set(['foundation', 'iam', 'catalog', 'crm', 'hr'])

    expect(API_CONNECTED_MODULES).toEqual(['foundation', 'iam', 'catalog', 'crm', 'hr'])
    expect(isApiConnectedModule('catalog')).toBe(true)
    expect(isModuleAvailable('catalog', enabled)).toBe(true)
    expect(isModuleAvailable('catalog', new Set())).toBe(false)
  })

  it('mantiene disponibles los módulos frontend durante la migración progresiva', () => {
    const enabled = new Set(['foundation', 'iam', 'catalog'])

    for (const moduleCode of [
      'pos',
      'appointments',
      'purchasing',
      'incidents',
      'accounting',
      'reporting',
    ]) {
      expect(isModuleAvailable(moduleCode, enabled)).toBe(true)
    }
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
    expect(routeRequirement('/pos')).toBeNull()
    expect(routeRequirement('/crm/pipeline')).toBeNull()
    expect(routeRequirement('/finanzas')).toBeNull()
  })
})
