/** Cotización descartada (cancelada en backend, sigue en historial del lead). */
export function isDiscardedCrmQuote(quote) {
  if (!quote?.id) return false
  if (quote.structuralStatus === 'cancelled') return true
  if (quote.status === 'cancelada') return true
  return false
}

/** Cotizaciones visibles en listados CRM activos (excluye descartadas). */
export function isActiveCrmQuote(quote) {
  if (!quote?.id) return false
  return !isDiscardedCrmQuote(quote)
}

/** Cotizaciones que deben aparecer en el historial del lead. */
export function appearsInLeadTimelineQuote(quote) {
  if (!quote?.id) return false
  return isActiveCrmQuote(quote) || isDiscardedCrmQuote(quote)
}
