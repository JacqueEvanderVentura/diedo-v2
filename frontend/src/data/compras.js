export const REQUEST_STATUSES = ['pendiente', 'aprobada', 'entregada', 'rechazada']

export const REQUEST_STATUS_META = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  aprobada: { label: 'Aprobada', tone: 'brand' },
  entregada: { label: 'Entregada', tone: 'success' },
  rechazada: { label: 'Rechazada', tone: 'danger' },
}

export const REQUEST_PRIORITIES = ['normal', 'alta']

export const COMPRAS_TABS = [
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'solicitudes', label: 'Solicitudes de Compra' },
  { id: 'configuracion', label: 'Configuración' },
]
