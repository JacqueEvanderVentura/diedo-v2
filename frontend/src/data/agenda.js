export const CABINAS = [
  { id: 'cab1', name: 'Cabina 1' },
  { id: 'cab2', name: 'Cabina 2' },
  { id: 'cab3', name: 'Cabina 3' },
  { id: 'cab4', name: 'Cabina 4' },
  { id: 'cab5', name: 'Cabina 5 Ventas' },
  { id: 'walkin', name: 'Cliente sin cita' },
]

export const EMPLOYEES = [
  { id: 'emp1', name: 'Jasmin Beltre Familia' },
  { id: 'emp2', name: 'Yocarlin Charlotte Felix Nuñez' },
  { id: 'emp3', name: 'Criswaily Mesa' },
  { id: 'emp4', name: 'Yaritza Castillo' },
  { id: 'emp5', name: 'Leaisi Ferreira' },
  { id: 'emp6', name: 'Leanny Rosa Ramirez' },
  { id: 'emp7', name: 'Helen Jissel Vega Kelly' },
  { id: 'emp8', name: 'Teresa De la Cruz Morillo' },
]

export const DURATION_OPTIONS = [
  { value: 30, label: '30 Minutos' },
  { value: 45, label: '45 Minutos' },
  { value: 60, label: '1 Hora' },
  { value: 90, label: '1 Hora 30 Minutos' },
  { value: 120, label: '2 Horas' },
]

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'No se repite (Cita única)' },
  { value: 'weekly', label: 'Cada semana' },
  { value: 'monthly', label: 'Cada mes' },
]

export const REPEAT_COUNTS = [2, 3, 4, 6, 8, 12]

export const CALENDAR_STATUSES = [
  { id: 'confirmada', name: 'Confirmada' },
  { id: 'asistio', name: 'Asistió' },
  { id: 'cancelada', name: 'Cancelada' },
  { id: 'retrasada', name: 'Retrasada' },
  { id: 'reprogramada', name: 'Reprogramada' },
]

export const cabinaName = (id) => CABINAS.find((c) => c.id === id)?.name || '—'
export const employeeName = (id) => EMPLOYEES.find((e) => e.id === id)?.name || '—'
