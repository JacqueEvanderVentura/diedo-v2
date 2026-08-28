export const CURRENT_USER_ID = 'u1'

export const DEPARTMENTS = ['Operaciones', 'Administración', 'Ventas', 'Laser', 'Recursos Humanos', 'Finanzas']

export const REQUEST_STATUSES = ['pendiente', 'aprobada', 'rechazada', 'cancelada']

export const REQUEST_STATUS_META = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  aprobada: { label: 'Aprobada', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
}

export const DEBT_STATUSES = ['pendiente', 'parcial', 'pagado']

export const DEBT_STATUS_META = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  parcial: { label: 'Parcial', tone: 'brand' },
  pagado: { label: 'Pagado', tone: 'success' },
}

export const DOCUMENT_TEMPLATES = [
  { id: 'certificado', label: 'Certificado Laboral', desc: 'Prueba de empleo y duración de servicio.', icon: 'FileText' },
  { id: 'bancaria', label: 'Carta Bancaria', desc: 'Confirmación oficial de salario para bancos.', icon: 'Building2' },
  { id: 'recomendacion', label: 'Carta de Recomendación', desc: 'Referencia profesional del empleado.', icon: 'Users' },
  { id: 'vacaciones', label: 'Constancia de Vacaciones', desc: 'Documento oficial de período vacacional.', icon: 'Calendar' },
]

export const REVIEW_STATUSES = ['borrador', 'publicado']

export const REVIEW_STATUS_META = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  publicado: { label: 'Publicado', tone: 'success' },
}

export const PAYROLL_PERIODS = ['quincena-1', 'quincena-2', 'mensual']

export const PAYROLL_PERIOD_LABELS = {
  'quincena-1': 'Primera quincena',
  'quincena-2': 'Segunda quincena',
  mensual: 'Mensual',
}
