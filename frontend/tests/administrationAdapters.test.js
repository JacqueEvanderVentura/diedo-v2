import { describe, expect, it } from 'vitest'
import {
  branchAssignmentToApi,
  branchErrorTarget,
  branchGeneralPatchToApi,
  branchPartnersPatchToApi,
  createBranchToApi,
  fiscalProfileToApi,
  legalEntityReferencesFromBranches,
  mapBranchesFromApi,
  mapBranchFromDemo,
  mapLegalEntityFromApi,
} from '@/services/adapters/administration'

const apiEntity = {
  id: 'entity-main',
  code: 'MAIN',
  legalName: 'Comercial Principal SRL',
  displayName: 'Comercial Principal',
  status: 'active',
  version: 7,
  taxIdentity: {
    id: 'tax-main',
    jurisdictionCode: 'DO',
    identifierType: 'RNC',
    identifierValue: '132908902',
    registeredName: 'Comercial Principal SRL',
    validFrom: '2026-01-01',
    validTo: null,
  },
  branches: [
    { id: 'branch-main', code: 'MAIN', name: 'Principal' },
    { id: 'branch-north', code: 'NORTH', name: 'Norte' },
  ],
  sharing: { branchCount: 2, shared: true },
}

const apiBranches = [
  {
    id: 'branch-main',
    legalEntityId: 'entity-main',
    code: 'MAIN',
    name: 'Principal',
    status: 'active',
    timezone: 'America/Santo_Domingo',
    version: 3,
    details: {
      address: 'Av. Principal 1',
      phone: '809-555-0101',
      email: 'main@example.com',
      manager: 'Ada',
      schedule: '09:00 - 18:00',
      independentBusiness: false,
      partners: [{ name: 'Ada', share: 50 }],
    },
  },
  {
    id: 'branch-north',
    legalEntityId: 'entity-main',
    code: 'NORTH',
    name: 'Norte',
    status: 'active',
    timezone: 'America/Santo_Domingo',
    version: 2,
    details: {},
  },
]

describe('administration adapters', () => {
  it('hidrata todas las sucursales con el perfil fiscal compartido sin perder detalles', () => {
    const entity = mapLegalEntityFromApi(apiEntity)
    const branches = mapBranchesFromApi(apiBranches, [entity])

    expect(branches).toHaveLength(2)
    expect(branches[0]).toMatchObject({
      legalName: 'Comercial Principal SRL',
      rnc: '132908902',
      address: 'Av. Principal 1',
      manager: 'Ada',
      legalEntityVersion: 7,
      sharing: { branchCount: 2, shared: true },
      source: 'api',
    })
    expect(branches[1]).toMatchObject({
      legalName: 'Comercial Principal SRL',
      rnc: '132908902',
      sharing: { branchCount: 2, shared: true },
    })
  })

  it('conserva la forma legacy de la sucursal demo y marca su origen', () => {
    expect(mapBranchFromDemo({
      id: 'demo-1',
      name: 'Demo Norte',
      legalName: 'Demo SRL',
      rnc: '1-01-00000-1',
      partners: [],
    })).toMatchObject({
      id: 'demo-1',
      legalName: 'Demo SRL',
      rnc: '1-01-00000-1',
      source: 'demo',
    })
  })

  it('deriva referencias asignables sin exponer razón social ni RNC', () => {
    const references = legalEntityReferencesFromBranches(apiBranches)

    expect(references).toEqual([
      expect.objectContaining({
        id: 'entity-main',
        label: 'Entidad vinculada a Principal, Norte',
        legalName: '',
        rnc: '',
        referenceOnly: true,
        sharing: { branchCount: 2, shared: true },
      }),
    ])
  })

  it('separa los PATCH de general y socios para que el backend haga merge', () => {
    const branch = mapBranchesFromApi(apiBranches, [apiEntity])[0]
    const form = {
      ...branch,
      name: 'Principal Renovada',
      address: 'Av. Renovada 2',
      phone: '809-555-0199',
      email: '',
      manager: 'Grace',
      schedule: '08:00 - 17:00',
      independentBusiness: true,
      legalName: 'No debe viajar',
      rnc: '999999999',
      partners: [{ name: 'Grace Hopper', share: 100 }],
    }

    expect(branchGeneralPatchToApi(form, branch)).toEqual({
      name: 'Principal Renovada',
      status: 'active',
      timezone: 'America/Santo_Domingo',
      details: {
        address: 'Av. Renovada 2',
        phone: '809-555-0199',
        email: null,
        manager: 'Grace',
        schedule: '08:00 - 17:00',
      },
      version: 3,
    })
    expect(branchPartnersPatchToApi(form, branch)).toEqual({
      details: { partners: [{ name: 'Grace Hopper', document: null, share: 100 }] },
      version: 3,
    })
  })

  it('serializa el PUT fiscal plano con versión y el assignment discriminado', () => {
    const form = {
      legalName: 'Entidad Nueva SRL',
      legalDisplayName: 'Entidad Nueva',
      rnc: '1-32-90890-2',
      fiscalEffectiveFrom: '2026-08-29',
      legalEntityAction: 'new',
    }

    expect(fiscalProfileToApi(form, 7)).toEqual({
      legalName: 'Entidad Nueva SRL',
      displayName: 'Entidad Nueva',
      taxIdentity: {
        jurisdictionCode: 'DO',
        identifierType: 'RNC',
        identifierValue: '1-32-90890-2',
      },
      effectiveFrom: '2026-08-29',
      version: 7,
    })
    expect(branchAssignmentToApi(form, { version: 3 })).toEqual({
      assignment: {
        type: 'new',
        fiscalProfile: {
          legalName: 'Entidad Nueva SRL',
          displayName: 'Entidad Nueva',
          taxIdentity: {
            jurisdictionCode: 'DO',
            identifierType: 'RNC',
            identifierValue: '1-32-90890-2',
          },
          effectiveFrom: '2026-08-29',
        },
      },
      version: 3,
    })
  })

  it('crea la sucursal con exactamente una fuente legal y nunca encadena un legacy legalEntityId', () => {
    const base = {
      name: 'Sucursal Atómica',
      address: 'Av. Atomicidad 1',
      phone: '',
      email: '',
      manager: '',
      schedule: '09:00 - 18:00',
      partners: [],
      legalEntityMode: 'existing',
      targetLegalEntityId: 'entity-main',
    }
    const existing = createBranchToApi(base, { code: 'ATOMIC', timezone: 'America/Santo_Domingo' })
    const created = createBranchToApi({
      ...base,
      legalEntityMode: 'new',
      legalName: 'Atómica SRL',
      legalDisplayName: '',
      rnc: '132908903',
      fiscalEffectiveFrom: '',
    }, { code: 'ATOMIC-NEW', timezone: 'America/Santo_Domingo' })

    expect(existing.legalEntityAssignment).toEqual({ type: 'existing', legalEntityId: 'entity-main' })
    expect(existing).not.toHaveProperty('legalEntityId')
    expect(existing.details.independentBusiness).toBe(false)
    expect(created.legalEntityAssignment).toMatchObject({
      type: 'new',
      fiscalProfile: {
        legalName: 'Atómica SRL',
        displayName: null,
        taxIdentity: { identifierValue: '132908903' },
      },
    })
    expect(created).not.toHaveProperty('legalEntityId')
    expect(created.details.independentBusiness).toBe(true)
  })

  it('dirige errores del backend a la pestaña y campo correspondientes', () => {
    expect(branchErrorTarget('taxIdentity.identifierValue')).toEqual({ tab: 'fiscal', field: 'rnc' })
    expect(branchErrorTarget('assignment.fiscalProfile.effectiveFrom')).toEqual({ tab: 'fiscal', field: 'fiscalEffectiveFrom' })
    expect(branchErrorTarget('details.partners')).toEqual({ tab: 'socios', field: 'partners' })
  })
})
