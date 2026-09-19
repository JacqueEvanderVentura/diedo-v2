/** Tamaños de página para listas CRM (clientes / leads). */
export const DEFAULT_CRM_PAGE_SIZE = 50
/** Debe coincidir con `pageSize` máximo del API (routers CRM / master data). */
export const API_MAX_CRM_PAGE_SIZE = 500
export const CRM_PAGE_SIZE_OPTIONS = [50, 200, 500]

export function normalizeCrmPageSize(size) {
  const parsed = Number(size)
  const n = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CRM_PAGE_SIZE
  return Math.min(n, API_MAX_CRM_PAGE_SIZE)
}

/** @deprecated Usar paginación por página. */
export const CRM_INFINITE_PAGE_SIZE = API_MAX_CRM_PAGE_SIZE
