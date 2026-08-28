import { CABINAS, CALENDAR_STATUSES } from '@/data/agenda'
import { formatDOP } from '@/lib/format'
import { statusMeta } from '@/stores/agendaStore'

const BOOL = (v) => (v ? 'Sí' : 'No')

const FIELD_DEFS = [
  { field: 'date', label: 'Fecha' },
  { field: 'time', label: 'Hora' },
  { field: 'duration', label: 'Duración (min)' },
  { field: 'customerName', label: 'Cliente' },
  { field: 'customerPhone', label: 'Teléfono' },
  { field: 'serviceName', label: 'Servicio' },
  { field: 'employeeId', label: 'Empleado', format: (v, ctx) => ctx?.employeeName?.(v) || v || '—' },
  { field: 'branchId', label: 'Sucursal', format: (v, ctx) => ctx?.branchName?.(v) || v || '—' },
  { field: 'cabinaId', label: 'Cabina', format: (v) => CABINAS.find((c) => c.id === v)?.name || v || '—' },
  {
    field: 'status',
    label: 'Estado',
    format: (v) => statusMeta(v).name,
  },
  { field: 'price', label: 'Precio', format: (v) => formatDOP(v) },
  { field: 'notes', label: 'Notas' },
  { field: 'pendingPayment', label: 'Pendiente de pago', format: BOOL },
  { field: 'pendingAmount', label: 'Monto pendiente', format: (v) => formatDOP(v) },
  { field: 'completed', label: 'Completada', format: BOOL },
  { field: 'firstTime', label: 'Primera vez', format: BOOL },
  { field: 'freeTrial', label: 'Prueba gratuita', format: BOOL },
]

function displayValue(value, def, ctx) {
  if (value === null || value === undefined || value === '') return '—'
  return def.format ? def.format(value, ctx) : String(value)
}

export function diffAppointmentChanges(prev, next, ctx = {}) {
  const changes = []
  FIELD_DEFS.forEach((def) => {
    const from = prev?.[def.field]
    const to = next?.[def.field]
    if (JSON.stringify(from) === JSON.stringify(to)) return
    changes.push({
      field: def.field,
      label: def.label,
      from: displayValue(from, def, ctx),
      to: displayValue(to, def, ctx),
    })
  })
  return changes
}

export function buildCreateChanges(appointment, ctx = {}) {
  return FIELD_DEFS.filter((def) => {
    const v = appointment?.[def.field]
    return v !== null && v !== undefined && v !== '' && v !== false && v !== 0
  }).map((def) => ({
    field: def.field,
    label: def.label,
    from: '—',
    to: displayValue(appointment[def.field], def, ctx),
  }))
}

export function sourceLabel(source) {
  if (source === 'self') return 'Portal de agendación (auto-agendado)'
  return 'Equipo / recepción'
}

export function actionLabel(action) {
  const map = {
    create: 'Cita creada',
    update: 'Cita editada',
    status: 'Estado actualizado',
  }
  return map[action] || action
}

export function backfillHistory(appointment) {
  if (Array.isArray(appointment.history) && appointment.history.length) return appointment.history
  const entries = []
  const createdAt = appointment.createdAt || new Date().toISOString()
  entries.push({
    id: `log-backfill-create-${appointment.id}`,
    at: createdAt,
    userId: null,
    userName: appointment.createdBy || 'Sistema',
    action: 'create',
    changes: [{ field: 'appointment', label: 'Registro', from: '—', to: 'Cita registrada en el sistema' }],
  })
  if (appointment.updatedAt && appointment.updatedAt !== appointment.createdAt) {
    entries.push({
      id: `log-backfill-update-${appointment.id}`,
      at: appointment.updatedAt,
      userId: null,
      userName: appointment.updatedBy || appointment.createdBy || 'Sistema',
      action: 'update',
      changes: [{ field: 'general', label: 'Actualización', from: '—', to: 'Última modificación (sin detalle histórico)' }],
    })
  }
  return entries
}

export function fmtAuditWhen(iso) {
  try {
    return new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso || '—'
  }
}
