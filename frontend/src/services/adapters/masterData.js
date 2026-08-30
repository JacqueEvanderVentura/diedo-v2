const DEMO_BRANCH_IDS = Object.freeze({
  DOWNTOWN: 'charm-dn',
  NORTH: 'charm-santiago',
  EAST: 'charm-este',
  HQ: 'charm-dn',
})

export function mapCustomerFromApi(item) {
  const branchIds = (item.branches || []).map((branch) => branch.id)
  return {
    id: item.id,
    name: item.displayName,
    displayName: item.displayName,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    company: item.businessName || '',
    phone: item.phone || null,
    email: item.email || null,
    customerType: item.customerType === 'business' ? 'b2b' : 'b2c',
    customerStatus: item.status === 'active' ? 'activo' : item.status,
    branchIds,
    branchId: branchIds[0] || null,
    points: 0,
    notes: '',
    active: item.status === 'active',
    status: item.status,
    version: item.version,
    attachmentCount: item.attachmentCount || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    api: true,
  }
}

export function mapCustomerFromDemo(item) {
  const branchIds = (item.branchCodes || []).map((code) => DEMO_BRANCH_IDS[code] || code)
  return {
    id: item.seedKey,
    name: item.displayName,
    displayName: item.displayName,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    company: item.businessName || '',
    phone: item.phone || null,
    email: item.email || null,
    customerType: item.customerType === 'business' ? 'b2b' : 'b2c',
    customerStatus: item.status === 'active' ? 'activo' : item.status,
    branchIds,
    branchId: branchIds[0] || null,
    points: item.points || 0,
    notes: '',
    active: item.status === 'active',
    status: item.status,
    version: 1,
    source: 'demo',
  }
}

export function mapEmployeeFromApi(item) {
  const branchIds = (item.branches || []).map((branch) => branch.id)
  return {
    id: item.id,
    employeeNumber: item.employeeNumber,
    firstName: item.firstName,
    lastName: item.lastName,
    email: item.email || null,
    phone: item.phone || null,
    position: item.position,
    department: item.department || '',
    branchIds,
    branchId: branchIds[0] || null,
    jefeIds: item.supervisorIds || [],
    jefeId: item.supervisorIds?.[0] || null,
    contractType: item.contractType || '',
    hireDate: item.hireDate,
    usuarioId: item.platformUserId || null,
    active: item.status === 'active',
    status: item.status,
    version: item.version,
    scheduleVersion: item.schedule?.version || 1,
    scheduleTimezone: item.schedule?.timezone || 'America/Santo_Domingo',
    workSchedule: item.schedule?.week || {},
    attachmentCount: item.attachmentCount || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    api: true,
  }
}

export function mapEmployeeFromDemo(item) {
  const branchIds = (item.branchCodes || []).map((code) => DEMO_BRANCH_IDS[code] || code)
  return {
    id: item.seedKey,
    employeeNumber: item.employeeNumber,
    firstName: item.firstName,
    lastName: item.lastName,
    email: item.email || null,
    phone: item.phone || null,
    position: item.position,
    department: item.department || '',
    branchIds,
    branchId: branchIds[0] || null,
    jefeIds: item.supervisorSeedKeys || [],
    jefeId: item.supervisorSeedKeys?.[0] || null,
    contractType: item.contractType || '',
    hireDate: item.hireDate,
    usuarioId: item.userSeedKey || null,
    active: item.status !== 'inactive',
    status: item.status || 'active',
    version: 1,
    scheduleVersion: 1,
    scheduleTimezone: item.timezone || 'America/Santo_Domingo',
    workSchedule: item.workSchedule || {},
    createdAt: item.hireDate,
    updatedAt: item.hireDate,
    source: 'demo',
    ...(item.futureHr || {}),
  }
}

export function customerToApiPayload(data, fallbackBranchIds = []) {
  return {
    customerType: data.customerType === 'b2b' ? 'business' : 'person',
    displayName: data.name || data.displayName,
    firstName: data.firstName || null,
    lastName: data.lastName || null,
    businessName: data.company || data.businessName || null,
    email: data.email || null,
    phone: data.phone || null,
    branchIds: data.branchIds?.length ? data.branchIds : fallbackBranchIds,
    status: data.active === false ? 'inactive' : data.status || 'active',
  }
}

export function employeeToApiPayload(data, fallbackBranchIds = []) {
  return {
    employeeNumber: data.employeeNumber || undefined,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    phone: data.phone || null,
    position: data.position,
    department: data.department || null,
    contractType: data.contractType || null,
    hireDate: data.hireDate,
    platformUserId: data.usuarioId || null,
    branchIds: data.branchIds?.length ? data.branchIds : fallbackBranchIds,
    supervisorIds: data.jefeIds || [],
    timezone: data.scheduleTimezone || 'America/Santo_Domingo',
    schedule: data.workSchedule || {},
    status: data.active === false ? 'inactive' : data.status || 'active',
  }
}
