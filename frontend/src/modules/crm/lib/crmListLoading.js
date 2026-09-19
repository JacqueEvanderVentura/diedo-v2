import { crmApi } from '@/services/crmApi'
import { mapLeadFromApi } from '@/services/adapters/crm'

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

/** Carga leads faltantes referenciados por oportunidades (para búsqueda / etapas en lista). */
export async function fetchMissingLeadsForOpportunities(existingLeads, opportunities) {
  const known = new Set(existingLeads.map((lead) => lead.id))
  const missing = [...new Set(
    opportunities.map((opp) => opp.leadId).filter((id) => id && !known.has(id)),
  )].slice(0, 50)
  if (!missing.length) return []
  const records = await Promise.all(
    missing.map((id) => crmApi.getLead(id).then(mapLeadFromApi).catch(() => null)),
  )
  return records.filter(Boolean)
}
