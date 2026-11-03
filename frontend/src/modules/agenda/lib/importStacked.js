export const IMPORT_STACK_NOTE_MARKER = 'Importación: agrupada con otras citas'

export function isImportStackedAppointment(apt) {
  return Boolean(apt?.notes?.includes(IMPORT_STACK_NOTE_MARKER))
}

export function importStackGroupKey(apt) {
  if (!isImportStackedAppointment(apt)) return null
  const resourceId = apt.resourceId || apt.cabinaId || ''
  return `${resourceId}|${apt.date}|${apt.time}`
}

export function buildImportStackGroups(appointments) {
  const groups = new Map()
  appointments.forEach((apt) => {
    const key = importStackGroupKey(apt)
    if (!key) return
    const current = groups.get(key) || []
    current.push(apt)
    groups.set(key, current)
  })
  return groups
}

export function importStackSiblings(appointments, apt) {
  const key = importStackGroupKey(apt)
  if (!key) return []
  const group = buildImportStackGroups(appointments).get(key) || []
  return group.length > 1 ? group : []
}
