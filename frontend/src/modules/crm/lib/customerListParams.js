export function buildCustomerListApiParams({
  page,
  pageSize,
  search = '',
  typeFilter = 'all',
  statusFilter = 'all',
  branchIds = [],
} = {}) {
  const params = { page, pageSize }
  const q = search.trim()
  if (q) params.search = q
  if (typeFilter === 'b2c') params.type = 'person'
  if (typeFilter === 'b2b') params.type = 'business'
  if (statusFilter === 'activo') params.status = 'active'
  if (statusFilter === 'inactivo') params.status = 'inactive'
  if (Array.isArray(branchIds) && branchIds.length === 1) {
    params.branchId = branchIds[0]
  }
  return params
}
