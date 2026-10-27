import { canBookResource } from '@/modules/configuracion/lib/agendaCabinas'

const SCHEDULE_FIELDS = ['branchId', 'date', 'time', 'duration', 'employeeId', 'cabinaId']

function sortResources(resources) {
  return [...resources].sort((left, right) => {
    const order = (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
    if (order !== 0) return order
    return String(left.name || '').localeCompare(String(right.name || ''))
  })
}

/** Bookable cabins for the branch, plus the appointment's current cabin even when the caller only has `view`. */
export function resolveAppointmentFormResources({
  resources = [],
  branchId,
  currentCabinaId,
} = {}) {
  const scoped = resources.filter(
    (resource) => resource.branchId === branchId && resource.active !== false,
  )
  const sortedBookable = sortResources(scoped.filter((resource) => canBookResource(resource.access)))

  if (!currentCabinaId || sortedBookable.some((resource) => resource.id === currentCabinaId)) {
    return sortedBookable
  }

  const current = resources.find(
    (resource) => resource.id === currentCabinaId && resource.branchId === branchId,
  )
  return [
    current || { id: currentCabinaId, name: 'Cabina asignada', branchId, access: 'view', active: true },
    ...sortedBookable,
  ]
}

/** Editing never rewrites the cabin; creating autofills the first bookable cabin once an employee is chosen. */
export function resolveNextCabinaId({
  isEditing,
  employeeSelected,
  formCabinaId = '',
  options = [],
} = {}) {
  if (isEditing || !employeeSelected) return formCabinaId
  if (formCabinaId && options.some((resource) => resource.id === formCabinaId)) {
    return formCabinaId
  }
  return options.find((resource) => canBookResource(resource.access))?.id || ''
}

/** "Cualquiera disponible" only applies to new bookings; on update the API would null both employee and cabin. */
export function resolveAppointmentAssignment({ isEditing, employeeId = '', cabinaId = '' } = {}) {
  if (!isEditing && !employeeId) {
    return { employeeId: '', cabinaId: '', anyAvailable: true }
  }
  return { employeeId: employeeId || '', cabinaId: cabinaId || '', anyAvailable: false }
}

export function appointmentScheduleChanged(original, form) {
  if (!original) return true
  return SCHEDULE_FIELDS.some(
    (field) => String(original[field] ?? '') !== String(form[field] ?? ''),
  )
}
