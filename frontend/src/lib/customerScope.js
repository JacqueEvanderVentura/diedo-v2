import { getRowBranchIds, matchesBranches } from '@/lib/branches'

export function sessionBranchIds(user) {
  if (!user?.branchIds?.length) return null
  return user.branchIds
}

export function customersVisibleToSession(customers, user) {
  const branchIds = sessionBranchIds(user)
  if (!branchIds) return customers
  return customers.filter((customer) => {
    if (customer.id === 'walk-in' || customer.isDefault) return true
    return matchesBranches(customer, branchIds, getRowBranchIds)
  })
}

/** Customer can be sold to / scheduled at this branch (matches API branch assignment). */
export function customerActiveAtBranch(customer, branchId) {
  if (!customer || customer.isDefault || customer.id === 'walk-in') return true
  if (!branchId) return true
  return matchesBranches(customer, [branchId], getRowBranchIds)
}

export function customersAtBranch(customers, branchId) {
  return customers.filter((customer) => {
    if (customer.isDefault || customer.id === 'walk-in') return false
    if (!branchId) return true
    return customerActiveAtBranch(customer, branchId)
  })
}
