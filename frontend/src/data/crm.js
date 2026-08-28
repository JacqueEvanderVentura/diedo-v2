export const DIEDO_MODULES = ['pos', 'agenda', 'inventarios', 'finanzas', 'crm', 'incidencias', 'config']

export const MODULE_LABELS = {
  pos: 'POS',
  agenda: 'Agenda',
  inventarios: 'Inventarios',
  finanzas: 'Finanzas',
  crm: 'CRM',
  incidencias: 'Incidencias',
  config: 'Configuración',
}

export const LEAD_STATUSES = ['nuevo', 'contactado', 'calificado', 'descartado', 'convertido']

export const LEAD_STATUS_META = {
  nuevo: { label: 'Nuevo', tone: 'brand' },
  contactado: { label: 'Contactado', tone: 'warning' },
  calificado: { label: 'Calificado', tone: 'success' },
  descartado: { label: 'Descartado', tone: 'neutral' },
  convertido: { label: 'Convertido', tone: 'success' },
}

export const LEAD_SOURCES = ['manual', 'serp', 'serper', 'referral', 'import']

export const SOURCE_LABELS = {
  manual: 'Manual',
  serp: 'Web scraping',
  serper: 'Web scraping',
  referral: 'Referido',
  import: 'Importación',
}

export const OPPORTUNITY_STAGES = ['nuevo', 'contactado', 'propuesta', 'negociacion', 'cerrado', 'perdido']

export const STAGE_META = {
  nuevo: { label: 'Nuevo', tone: 'brand', color: 'bg-blue-500' },
  contactado: { label: 'Contactado', tone: 'warning', color: 'bg-amber-500' },
  propuesta: { label: 'Propuesta', tone: 'neutral', color: 'bg-violet-500' },
  negociacion: { label: 'Negociación', tone: 'warning', color: 'bg-orange-500' },
  cerrado: { label: 'Cerrado', tone: 'success', color: 'bg-emerald-500' },
  perdido: { label: 'Perdido', tone: 'danger', color: 'bg-red-500' },
}

export const ACTIVITY_TYPES = ['llamada', 'email', 'reunion', 'nota', 'tarea']

export const ACTIVITY_TYPE_META = {
  llamada: { label: 'Llamada', icon: 'Phone' },
  email: { label: 'Email', icon: 'Mail' },
  reunion: { label: 'Reunión', icon: 'Users' },
  nota: { label: 'Nota', icon: 'StickyNote' },
  tarea: { label: 'Tarea', icon: 'CheckSquare' },
}

export const QUOTE_STATUSES = ['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida']

export const QUOTE_STATUS_META = {
  borrador: { label: 'Borrador', tone: 'neutral' },
  enviada: { label: 'Enviada', tone: 'brand' },
  aceptada: { label: 'Aceptada', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
  vencida: { label: 'Vencida', tone: 'warning' },
}

export const CUSTOMER_TYPES = ['b2c', 'b2b']
export const CUSTOMER_STATUSES = ['activo', 'prospecto', 'inactivo']

export const CUSTOMER_STATUS_META = {
  activo: { label: 'Activo', tone: 'success' },
  prospecto: { label: 'Prospecto', tone: 'brand' },
  inactivo: { label: 'Inactivo', tone: 'neutral' },
}

export const DEFAULT_SCORING_WEIGHTS = {
  pos: 1,
  agenda: 1,
  inventarios: 1,
  finanzas: 1,
  crm: 1,
  incidencias: 0.8,
  config: 0.6,
}

export const SERP_HOUR_LIMIT = 50
export const SERP_MONTH_LIMIT = 250
