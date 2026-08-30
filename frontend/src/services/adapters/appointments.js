const STATUS_FROM_API = Object.freeze({
  pending: 'pendiente',
  confirmed: 'confirmada',
  completed: 'completada',
  attended: 'asistio',
  no_show: 'noshow',
  cancelled: 'cancelada',
  delayed: 'retrasada',
  rescheduled: 'reprogramada',
})

const STATUS_TO_API = Object.freeze(
  Object.fromEntries(Object.entries(STATUS_FROM_API).map(([api, ui]) => [ui, api]))
)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function optionalApiReference(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return UUID_PATTERN.test(normalized) ? normalized : null
}

export function appointmentStatusFromApi(status) {
  return STATUS_FROM_API[status] || status || 'pendiente'
}

export function appointmentStatusToApi(status) {
  return STATUS_TO_API[status] || status || 'pending'
}

function actorName(actor, fallback) {
  if (typeof actor === 'string') return actor
  return actor?.displayName || actor?.name || fallback || ''
}

export function mapAppointmentFromApi(item) {
  const resource = item.resource || null
  return {
    id: item.id,
    branchId: item.branchId,
    date: item.date,
    time: item.time,
    duration: Number(item.duration) || 30,
    customerId: item.customerId || item.customer?.id || null,
    customerName: item.customerName || item.customer?.name || item.customer?.displayName || 'Cliente',
    customerPhone: item.customerPhone || item.customer?.phone || '',
    serviceId: item.serviceId || item.service?.id || null,
    serviceName: item.serviceName || item.service?.name || '',
    employeeId: item.employeeId || item.employee?.id || null,
    cabinaId: item.resourceId || resource?.id || null,
    resourceId: item.resourceId || resource?.id || null,
    resourceName: resource?.name || item.resourceName || '',
    price: Number(item.price) || 0,
    status: appointmentStatusFromApi(item.status),
    notes: item.notes || '',
    pendingPayment: item.pendingPayment === true,
    pendingAmount: Number(item.pendingAmount) || 0,
    firstTime: item.firstTime === true,
    freeTrial: item.freeTrial === true,
    completed: item.completed === true || item.status === 'completed',
    recurrence: item.recurrence || 'none',
    repeatCount: Number(item.repeatCount) || 1,
    reminderSent: item.reminderSent !== false,
    source: item.source || 'staff',
    createdBy: actorName(item.createdBy, item.createdByName),
    updatedBy: actorName(item.updatedBy, item.updatedByName),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    history: Array.isArray(item.history) ? item.history : [],
    version: Number(item.version) || 1,
    api: true,
  }
}

export function mapAppointmentResourceFromApi(item, fallbackBranchId) {
  return {
    id: item.id,
    branchId: item.branchId || fallbackBranchId,
    code: item.code || '',
    name: item.name,
    resourceType: item.resourceType || 'room',
    status: item.status || 'active',
    active: item.status !== 'inactive' && item.status !== 'archived',
    version: Number(item.version) || 1,
  }
}

export function appointmentToApiPayload(data) {
  const status = data.completed === true ? 'completada' : data.status
  return {
    branchId: data.branchId,
    date: data.date,
    time: data.time,
    duration: Number(data.duration) || 30,
    customerId: optionalApiReference(data.customerId),
    customerName: data.customerName?.trim() || 'Cliente',
    customerPhone: data.customerPhone?.trim() || null,
    serviceId: optionalApiReference(data.serviceId),
    serviceName: data.serviceName?.trim() || '',
    employeeId: optionalApiReference(data.employeeId),
    resourceId: data.resourceId || data.cabinaId || null,
    price: Number(data.price) || 0,
    status: appointmentStatusToApi(status),
    notes: data.notes?.trim() || null,
    pendingPayment: data.pendingPayment === true,
    pendingAmount: Number(data.pendingAmount) || 0,
    firstTime: data.firstTime === true,
    freeTrial: data.freeTrial === true,
    recurrence: data.recurrence || 'none',
    repeatCount: data.recurrence === 'none' ? 1 : Number(data.repeatCount) || 1,
    reminderSent: data.reminderSent !== false,
    source: data.source || 'staff',
  }
}

export function appointmentPatchToApiPayload(data, version) {
  const payload = appointmentToApiPayload(data)
  return {
    branchId: payload.branchId,
    resourceId: payload.resourceId,
    customerId: payload.customerId,
    employeeId: payload.employeeId,
    serviceId: payload.serviceId,
    date: payload.date,
    time: payload.time,
    duration: payload.duration,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    serviceName: payload.serviceName,
    price: payload.price,
    status: payload.status,
    notes: payload.notes,
    pendingPayment: payload.pendingPayment,
    pendingAmount: payload.pendingAmount,
    firstTime: payload.firstTime,
    freeTrial: payload.freeTrial,
    reminderSent: payload.reminderSent,
    version,
  }
}

export function isAppointmentConflict(error) {
  return error?.status === 409 && error?.parameter === 'time'
}

export { STATUS_FROM_API, STATUS_TO_API }
