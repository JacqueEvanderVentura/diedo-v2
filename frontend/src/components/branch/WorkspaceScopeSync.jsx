import { useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceScopeStore } from '@/stores/workspaceScopeStore'

/** Keeps the persisted active branch valid when branches or session scope changes. */
export function WorkspaceScopeSync() {
  const branches = useConfigStore((state) => state.branches)
  const workspaceId = useSessionStore((state) => state.user?.workspaceId)
  const sessionUserId = useSessionStore((state) => state.user?.membershipId || state.user?.id)
  const userBranchIds = useSessionStore((state) => state.user?.branchIds)
  const ensureActiveBranch = useWorkspaceScopeStore((state) => state.ensureActiveBranch)
  const setActiveBranchId = useWorkspaceScopeStore((state) => state.setActiveBranchId)
  const ensureDashboardScope = useDashboardStore((state) => state.ensureSessionScope)
  const reconcileDashboardBranches = useDashboardStore((state) => state.reconcileBranchIds)

  useEffect(() => {
    if (!workspaceId || !sessionUserId) return
    ensureDashboardScope(workspaceId, sessionUserId)
  }, [workspaceId, sessionUserId, ensureDashboardScope])

  useEffect(() => {
    if (!branches.length) return
    const allowed = branches.filter((branch) => branch.active !== false).map((branch) => branch.id)
    reconcileDashboardBranches(allowed)
    const next = ensureActiveBranch(branches, userBranchIds)
    if (next) setActiveBranchId(next, { syncPos: true })
  }, [
    branches,
    userBranchIds,
    ensureActiveBranch,
    setActiveBranchId,
    reconcileDashboardBranches,
  ])

  return null
}
