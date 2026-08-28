import { searchSerpApi } from './serpApi'
import { searchSerperApi } from './serperApi'
import { resolveProvider } from '@/modules/crm/lib/serpQuota'
import { useCrmStore } from '@/stores/crmStore'

const HAS_SERPER = Boolean(import.meta.env.VITE_HAS_SERPER)

export async function searchBusinesses({ q, location, num = 10 }) {
  const store = useCrmStore.getState()
  const quotaState = {
    serpHourCount: store.serpHourCount,
    serpHourWindowStart: store.serpHourWindowStart,
    serpMonthCount: store.serpMonthCount,
    serpMonthKey: store.serpMonthKey,
  }

  const { provider, reason } = resolveProvider(quotaState, { hasSerperKey: HAS_SERPER })

  if (!provider) {
    const err = new Error('Search quota exceeded')
    err.code = 'QUOTA_EXCEEDED'
    throw err
  }

  let results
  if (provider === 'serper') {
    results = await searchSerperApi({ q, location, num })
  } else {
    results = await searchSerpApi({ q, location, num })
    store.recordSerpSearch()
  }

  return { results, provider, reason }
}
