export const REQUEST_STATUSES = ['pendiente', 'aprobada', 'pagada', 'entregada', 'rechazada']

export const REQUEST_STATUS_META = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  aprobada: { label: 'Aprobada', tone: 'brand' },
  pagada: { label: 'Pagada', tone: 'brand' },
  entregada: { label: 'Recibida', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
}

export const REQUEST_PRIORITIES = ['normal', 'alta']

export const COMPRAS_TABS = [
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'solicitudes', label: 'Solicitudes de Compra' },
  { id: 'comparativa', label: 'Comparativa' },
  { id: 'configuracion', label: 'Configuración' },
]
