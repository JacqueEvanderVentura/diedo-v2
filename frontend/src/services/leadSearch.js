import { crmApi } from './crmApi'

function normalizeDiscoveryItem(item) {
  return {
    name: item.name || 'Sin nombre',
    company: item.company || item.name || '',
    phone: item.phone || null,
    website: item.website || null,
    location: item.location || '',
    sourceUrl: item.sourceUrl || null,
    rawSnippet: item.rawSnippet || '',
    rating: item.rating ?? null,
    reviews: item.reviews ?? null,
  }
}

export async function searchBusinesses({ q, location, num = 10 }) {
  try {
    const response = await crmApi.searchDiscovery({
      query: q,
      location: location || null,
      limit: num,
    })
    return {
      results: (response.items || []).map(normalizeDiscoveryItem),
      provider: response.provider,
      reason: 'server_quota',
      quota: {
        hour: { used: response.hourUsed, limit: response.hourLimit },
        month: { used: response.monthUsed, limit: response.monthLimit },
      },
    }
  } catch (error) {
    if (error?.status === 429) {
      const err = new Error('Search quota exceeded')
      err.code = 'QUOTA_EXCEEDED'
      err.status = error.status
      err.parameter = error.parameter
      throw err
    }
    throw error
  }
}
