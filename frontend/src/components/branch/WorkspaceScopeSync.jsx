import { useEffect } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceScopeStore } from '@/stores/workspaceScopeStore'

/** Keeps the persisted active branch valid when branches or session scope changes. */
export function WorkspaceScopeSync() {
  const branches = useConfigStore((state) => state.branches)
  const userBranchIds = useSessionStore((state) => state.user?.branchIds)
  const ensureActiveBranch = useWorkspaceScopeStore((state) => state.ensureActiveBranch)
  const setActiveBranchId = useWorkspaceScopeStore((state) => state.setActiveBranchId)

  useEffect(() => {
    if (!branches.length) return
    const next = ensureActiveBranch(branches, userBranchIds)
    if (next) setActiveBranchId(next, { syncPos: true })
  }, [branches, userBranchIds, ensureActiveBranch, setActiveBranchId])

  return null
}
