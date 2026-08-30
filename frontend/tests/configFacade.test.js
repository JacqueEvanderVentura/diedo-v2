import { afterEach, describe, expect, it } from 'vitest'
import { configFacade } from '@/services/configFacade'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'

afterEach(() => {
  useSessionStore.setState({ status: 'demo', user: null })
  configFacade.synchronizeSessionBranches({ status: 'demo', workspaceId: null, visibleBranches: [] })
})

describe('config facade tenant branch synchronization', () => {
  it('reemplaza seeds por el scope de me aun si el usuario nunca visita Sucursales', () => {
    configFacade.synchronizeSessionBranches({
      status: 'online',
      workspaceId: 'workspace-a',
      visibleBranches: [
        { id: 'branch-a', legalEntityId: 'entity-a', code: 'A', name: 'Sucursal API A' },
      ],
    })

    expect(useConfigStore.getState().branches).toEqual([
      expect.objectContaining({
        id: 'branch-a',
        legalEntityId: 'entity-a',
        name: 'Sucursal API A',
        active: true,
        source: 'api',
      }),
    ])
    expect(useConfigStore.getState().branches.some((branch) => branch.id === 'charm-dn')).toBe(false)
  })

  it('preserva detalle fiscal dentro del mismo tenant y lo elimina al cambiar de workspace', () => {
    useSessionStore.setState({ status: 'online', user: { workspaceId: 'workspace-a' } })
    configFacade.synchronizeSessionBranches({
      status: 'online',
      workspaceId: 'workspace-a',
      visibleBranches: [{ id: 'branch-a', legalEntityId: 'entity-a', code: 'A', name: 'Sucursal A' }],
    })
    expect(configFacade.hydrateApiBranches([{
      id: 'branch-a',
      legalEntityId: 'entity-a',
      code: 'A',
      name: 'Sucursal A',
      legalName: 'Entidad A SRL',
      rnc: '132908902',
      address: 'Dirección A',
      active: true,
      source: 'api',
    }], { workspaceId: 'workspace-a' })).toBe(true)

    configFacade.synchronizeSessionBranches({
      status: 'online',
      workspaceId: 'workspace-a',
      visibleBranches: [{ id: 'branch-a', legalEntityId: 'entity-a', code: 'A2', name: 'Sucursal A Renombrada' }],
    })
    expect(useConfigStore.getState().branches[0]).toMatchObject({
      name: 'Sucursal A Renombrada',
      legalName: 'Entidad A SRL',
      rnc: '132908902',
      address: 'Dirección A',
    })

    useSessionStore.setState({ status: 'online', user: { workspaceId: 'workspace-b' } })
    configFacade.synchronizeSessionBranches({
      status: 'online',
      workspaceId: 'workspace-b',
      visibleBranches: [{ id: 'branch-b', legalEntityId: 'entity-b', code: 'B', name: 'Sucursal B' }],
    })
    expect(useConfigStore.getState().branches.map((branch) => branch.id)).toEqual(['branch-b'])
    expect(useConfigStore.getState().branches[0].legalName).toBe('')
    expect(configFacade.hydrateApiBranches([{ id: 'late-a' }], { workspaceId: 'workspace-a' })).toBe(false)
    expect(useConfigStore.getState().branches.map((branch) => branch.id)).toEqual(['branch-b'])
  })

  it('limpia ramas ante logout/401 y restaura el demo al entrar en modo demo', () => {
    configFacade.synchronizeSessionBranches({
      status: 'online',
      workspaceId: 'workspace-a',
      visibleBranches: [{ id: 'branch-a', legalEntityId: 'entity-a', code: 'A', name: 'Sucursal A' }],
    })
    configFacade.synchronizeSessionBranches({ status: 'online', workspaceId: null, visibleBranches: [] })
    expect(useConfigStore.getState().branches).toEqual([])

    configFacade.synchronizeSessionBranches({ status: 'demo', workspaceId: null, visibleBranches: [] })
    expect(useConfigStore.getState().branches.map((branch) => branch.id)).toContain('charm-dn')
    expect(useConfigStore.getState().branches.map((branch) => branch.id)).not.toContain('branch-a')
  })
})
