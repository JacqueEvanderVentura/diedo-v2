import { DEFAULT_CRM_PAGE_SIZE } from '@/modules/crm/constants/paging'

export function listMetaFromPaginated(mapped, extras = {}) {
  return {
    page: mapped.page,
    pageSize: mapped.pageSize ?? extras.pageSize ?? DEFAULT_CRM_PAGE_SIZE,
    totalPages: mapped.totalPages,
    totalItems: mapped.totalItems,
    loading: false,
    loadingMore: false,
    search: extras.search ?? '',
    branchId: extras.branchId ?? null,
  }
}

export function emptyListMeta() {
  return {
    page: 0,
    pageSize: DEFAULT_CRM_PAGE_SIZE,
    totalPages: 0,
    totalItems: 0,
    loading: false,
    loadingMore: false,
    search: '',
    branchId: null,
  }
}
