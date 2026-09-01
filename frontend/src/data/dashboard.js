export const DASHBOARD_FILTERS = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: 'Trimestre' },
]

// Temporary exception: this is replaced when the CRM Leads module becomes API-backed.
export const LEADS_BY_PERIOD = {
  today: 4073,
  week: 4120,
  month: 4310,
  quarter: 4560,
}
