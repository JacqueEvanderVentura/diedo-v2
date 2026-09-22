import { formatDOP } from '@/lib/format'

/** Plain-text offer summary for WhatsApp / clipboard from linked quotes. */
export function formatOpportunityOfferText(quotes, opportunityId, { customerName = '' } = {}) {
  const linked = (quotes || [])
    .filter((quote) => quote.opportunityId === opportunityId && quote.status !== 'cancelada')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))

  if (linked.length === 0) return null

  const quote = linked[0]
  const greeting = customerName ? `Hola ${customerName.split(' ')[0]},` : 'Hola,'
  const lines = [
    greeting,
    '',
    `Te comparto la oferta ${quote.number || ''}`.trim(),
    '',
  ];

  (quote.items || []).forEach((item) => {
    const qty = item.qty ?? item.quantity ?? 1
    const price = item.price ?? item.unitPrice ?? 0
    lines.push(`• ${item.name || item.itemName || 'Ítem'} × ${qty} — ${formatDOP(price * qty)}`)
  })

  lines.push('', `Total: ${formatDOP(quote.total)}`)
  return lines.join('\n')
}

export function resolveInstagramUrl(record) {
  for (const value of [record?.instagramUrl, record?.website]) {
    const raw = String(value || '').trim()
    if (!raw) continue
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      if (['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())) {
        return url.href
      }
    } catch {
      // Ignore malformed historical URLs.
    }
  }
  return null
}
