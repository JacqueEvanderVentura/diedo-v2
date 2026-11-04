import { gestionCitasAppointmentParams } from './gestionCitasQuery'

export const GESTION_CITAS_PAGE_SIZE_OPTIONS = [10, 25, 50]
export const DEFAULT_GESTION_CITAS_PAGE_SIZE = 25

const SORT_KEY_TO_API = {
  customer: 'customerName',
  date: 'date',
  time: 'date',
  status: 'status',
}

export function gestionCitasSortParams(sortKey, sortDir) {
  const sortBy = SORT_KEY_TO_API[sortKey] || 'date'
  return {
    sortBy,
    sortDirection: sortDir === 'asc' ? 'asc' : 'desc',
  }
}

export function buildGestionCitasListParams({
  branchId,
  employeeId,
  status,
  search,
  dateFilter,
  page,
  pageSize,
  sortKey,
  sortDir,
}) {
  const trimmedSearch = String(search || '').trim()
  return {
    ...(branchId === 'all' ? {} : { branchId }),
    ...(employeeId === 'all' ? {} : { employeeId }),
    ...(status === 'all' ? {} : { status }),
    ...(trimmedSearch ? { search: trimmedSearch } : {}),
    ...gestionCitasAppointmentParams(dateFilter),
    page,
    pageSize,
    ...gestionCitasSortParams(sortKey, sortDir),
  }
}

export function gestionCitasPaginationMeta({ page, pageSize, totalItems, totalPages }) {
  const safeTotal = Number(totalItems) || 0
  const safePage = Math.max(1, Number(page) || 1)
  const safePageSize = Math.max(1, Number(pageSize) || DEFAULT_GESTION_CITAS_PAGE_SIZE)
  const safeTotalPages = Math.max(1, Number(totalPages) || 1)
  return {
    page: safePage,
    pageSize: safePageSize,
    totalItems: safeTotal,
    totalPages: safeTotalPages,
    from: safeTotal === 0 ? 0 : (safePage - 1) * safePageSize + 1,
    to: Math.min(safePage * safePageSize, safeTotal),
  }
}
