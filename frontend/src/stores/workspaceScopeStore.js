import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { resolveActiveBranchId } from '@/lib/workspaceBranch'
import { usePosStore } from '@/stores/posStore'

function syncPosBranches(branchId) {
  if (!branchId) return
  const pos = usePosStore.getState()
  if (pos.branchId !== branchId) {
    pos.setBranch(branchId, { skipWorkspaceSync: true })
  }
  if (pos.cajaBranchId !== branchId) {
    pos.setCajaBranch(branchId, { skipWorkspaceSync: true })
  }
}

export const useWorkspaceScopeStore = create(
  persist(
    (set, get) => ({
      activeBranchId: null,

      setActiveBranchId: (branchId, options = {}) => {
        if (!branchId || branchId === 'all') return
        const { syncPos = true } = options
        if (branchId === get().activeBranchId) {
          if (syncPos) syncPosBranches(branchId)
          return
        }
        set({ activeBranchId: branchId })
        if (syncPos) syncPosBranches(branchId)
      },

      ensureActiveBranch: (branches, userBranchIds, { fallbackId = null } = {}) => {
        const next = resolveActiveBranchId({
          branches,
          userBranchIds,
          currentId: get().activeBranchId,
          fallbackId: fallbackId || usePosStore.getState().branchId,
        })
        if (!next) return null
        if (next !== get().activeBranchId) {
          set({ activeBranchId: next })
        }
        return next
      },
    }),
    {
      name: 'helios-workspace-scope',
      version: 1,
      partialize: (state) => ({ activeBranchId: state.activeBranchId }),
    }
  )
)
