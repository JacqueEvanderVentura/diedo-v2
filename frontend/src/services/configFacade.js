import { useConfigStore } from '@/stores/configStore'

const demoBranches = structuredClone(useConfigStore.getState().branches)
let activeWorkspaceId = null
let apiOwned = false

function mapSessionBranch(branch, current) {
  return {
    address: '',
    phone: '',
    email: '',
    manager: '',
    schedule: '',
    independentBusiness: false,
    partners: [],
    version: null,
    legalName: '',
    legalDisplayName: '',
    rnc: '',
    sharing: { branchCount: 0, shared: false },
    ...current,
    ...branch,
    active: current?.active ?? true,
    status: current?.status || 'active',
    source: 'api',
  }
}

/**
 * Shared configuration cache consumed by POS, Agenda, CRM and the remaining modules.
 * The backing store uses the project's in-memory ephemeral storage, never browser localStorage.
 */
export const configFacade = {
  branches: () => useConfigStore.getState().branches,

  synchronizeSessionBranches({ status, workspaceId, visibleBranches = [] }) {
    if (status === 'demo') {
      if (apiOwned) useConfigStore.getState().setBranches(structuredClone(demoBranches))
      activeWorkspaceId = null
      apiOwned = false
      return
    }
    if (status !== 'online' || !workspaceId) {
      useConfigStore.getState().setBranches([])
      activeWorkspaceId = null
      apiOwned = true
      return
    }

    const sameWorkspace = activeWorkspaceId === workspaceId
    const currentById = sameWorkspace
      ? new Map(useConfigStore.getState().branches.map((branch) => [branch.id, branch]))
      : new Map()
    const scopedBranches = (visibleBranches || []).map((branch) => (
      mapSessionBranch(branch, currentById.get(branch.id))
    ))
    useConfigStore.getState().setBranches(scopedBranches)
    activeWorkspaceId = workspaceId
    apiOwned = true
  },

  hydrateApiBranches(branches, { workspaceId } = {}) {
    if (workspaceId && activeWorkspaceId !== workspaceId) return false
    useConfigStore.getState().setBranches(branches)
    apiOwned = true
    return true
  },

  clearApiBranches({ workspaceId } = {}) {
    useConfigStore.getState().setBranches([])
    activeWorkspaceId = workspaceId || null
    apiOwned = true
    return true
  },

  activeWorkspace: () => activeWorkspaceId,
}
