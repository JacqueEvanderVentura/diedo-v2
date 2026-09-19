function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function collectSearchText(opportunity, lead, customer) {
  const parts = [
    opportunity?.id,
    opportunity?.title,
    opportunity?.customerName,
    lead?.id,
    lead?.name,
    lead?.company,
    lead?.phone,
    lead?.email,
    lead?.rawSnippet,
    customer?.id,
    customer?.name,
    customer?.displayName,
    customer?.businessName,
    customer?.phone,
    customer?.email,
    customer?.documentId,
  ]
  return parts.filter(Boolean).join(' ')
}

/** Filtra oportunidades por texto libre (nombre, teléfono, documento, IDs, kommo:…). */
export function opportunityMatchesQuery(opportunity, { lead = null, customer = null }, query) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return true

  const haystack = collectSearchText(opportunity, lead, customer)
  const lowerHaystack = haystack.toLowerCase()
  const lowerQuery = trimmed.toLowerCase()
  if (lowerHaystack.includes(lowerQuery)) return true

  const queryDigits = digitsOnly(trimmed)
  if (queryDigits.length >= 3) {
    const digitHaystack = digitsOnly(haystack)
    if (digitHaystack.includes(queryDigits)) return true
  }

  return false
}
