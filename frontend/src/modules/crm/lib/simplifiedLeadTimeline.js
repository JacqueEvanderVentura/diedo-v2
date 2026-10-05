import { appearsInLeadTimelineQuote } from '@/modules/crm/lib/crmQuoteVisibility'

export function leadQuotesForTimeline(quotes, leadId) {
  if (!leadId) return []
  return (quotes || [])
    .filter((quote) => quote.leadId === leadId && appearsInLeadTimelineQuote(quote))
    .sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0),
    )
}

export function buildSimplifiedLeadTimeline(activities, quotes, leadId, { limit = 12 } = {}) {
  const activityEntries = (activities || []).map((activity) => ({
    kind: 'activity',
    id: `activity-${activity.id}`,
    sortAt: activity.completedAt || activity.createdAt || activity.dueAt || '',
    activity,
  }))
  const quoteEntries = leadQuotesForTimeline(quotes, leadId).map((quote) => ({
    kind: 'quote',
    id: `quote-${quote.id}`,
    sortAt: quote.updatedAt || quote.createdAt || '',
    quote,
  }))
  return [...activityEntries, ...quoteEntries]
    .sort((a, b) => new Date(a.sortAt || 0) - new Date(b.sortAt || 0))
    .slice(-limit)
}
