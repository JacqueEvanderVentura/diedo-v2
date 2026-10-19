// Constants for report modules (datasets come from API).

export const MEMBERSHIP_STATUSES = [
  { id: 'activo', label: 'Activo' },
  { id: 'proximo', label: 'Próximo a vencer' },
  { id: 'vencido', label: 'Vencido' },
  { id: 'inactivo', label: 'Inactivo' },
]

/** Fallback when API summary has no plan breakdown yet. */
export const MEMBERSHIP_PLANS = []
