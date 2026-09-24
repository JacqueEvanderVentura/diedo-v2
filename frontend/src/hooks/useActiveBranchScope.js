import { useCallback, useEffect, useMemo } from 'react'
import { buildBranchFilterOptions, branchName } from '@/lib/branches'
import { getAllowedBranches, isUuid } from '@/lib/workspaceBranch'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceScopeStore } from '@/stores/workspaceScopeStore'

/**
 * Single active branch shared across POS, agenda calendar, caja, etc.
 * Does not replace multi-select filters (dashboard, reportes).
 */
export function useActiveBranchScope() {
  const branches = useConfigStore((state) => state.branches)
  const userBranchIds = useSessionStore((state) => state.user?.branchIds)
  const activeBranchId = useWorkspaceScopeStore((state) => state.activeBranchId)
  const setActiveBranchId = useWorkspaceScopeStore((state) => state.setActiveBranchId)
  const ensureActiveBranch = useWorkspaceScopeStore((state) => state.ensureActiveBranch)

  useEffect(() => {
    ensureActiveBranch(branches, userBranchIds)
  }, [branches, userBranchIds, ensureActiveBranch])

  const allowedBranches = useMemo(
    () => getAllowedBranches(branches, userBranchIds),
    [branches, userBranchIds]
  )

  const online = useSessionStore((state) => state.status === 'online')
  const resolvedBranchId = useMemo(() => {
    const pool =
      online && allowedBranches.some((branch) => isUuid(branch.id))
        ? allowedBranches.filter((branch) => isUuid(branch.id))
        : allowedBranches
    if (activeBranchId && pool.some((branch) => branch.id === activeBranchId)) {
      return activeBranchId
    }
    return pool[0]?.id || ''
  }, [activeBranchId, allowedBranches, online])

  const setActiveBranch = useCallback(
    (branchId) => setActiveBranchId(branchId, { syncPos: true }),
    [setActiveBranchId]
  )

  const selectOptions = useMemo(
    () => allowedBranches.map((branch) => ({ value: branch.id, label: branch.name })),
    [allowedBranches]
  )

  const filterOptions = useMemo(
    () => buildBranchFilterOptions(allowedBranches, { includeAll: false }),
    [allowedBranches]
  )

  return {
    activeBranchId: resolvedBranchId,
    setActiveBranch,
    branches: allowedBranches,
    selectOptions,
    filterOptions,
    branchLabel: branchName(allowedBranches, resolvedBranchId),
  }
}
