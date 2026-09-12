const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isOnlineBranchId(branchId) {
  return Boolean(branchId) && UUID_PATTERN.test(branchId)
}

export function pickRegisterSnapshot(state, branchId = state.cajaBranchId || state.branchId) {
  return {
    register: {
      ...state.register,
      branchId: branchId || state.register?.branchId || null,
    },
    cashSales: state.cashSales,
    shiftSales: state.shiftSales,
    shiftIncomes: state.shiftIncomes,
    expenses: state.expenses,
    registerSummary: state.registerSummary,
    lastCloseSummary: state.lastCloseSummary,
    pagination: state.pagination,
  }
}

export function emptyRegisterView(branchId) {
  return {
    register: {
      id: null,
      open: false,
      openedAt: null,
      openingCash: 0,
      closedAt: null,
      branchId,
      version: null,
      apiSynced: true,
    },
    cashSales: 0,
    shiftSales: [],
    shiftIncomes: [],
    expenses: [],
    registerSummary: null,
    lastCloseSummary: null,
  }
}

export function resolveBranchRegisterOpen(state, branchId) {
  if (!branchId) return false
  if (state.register?.branchId === branchId) {
    return Boolean(state.register?.open)
  }
  return Boolean(state.registerByBranch?.[branchId]?.register?.open)
}

export function registerViewForBranch(state, branchId) {
  if (!branchId) return null
  if (state.register?.branchId === branchId) {
    return pickRegisterSnapshot(state, branchId)
  }
  return state.registerByBranch?.[branchId] || null
}
