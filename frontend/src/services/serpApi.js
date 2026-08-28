function normalizeLocalResult(item) {
  return {
    name: item.title || item.name || 'Sin nombre',
    company: item.title || item.name || '',
    phone: item.phone || item.phone_number || null,
    website: item.website || item.link || null,
    location: item.address || item.location || '',
    sourceUrl: item.link || item.place_id_link || null,
    rawSnippet: [item.type, item.description, item.snippet].filter(Boolean).join(' · '),
    rating: item.rating ?? null,
    reviews: item.reviews ?? item.review_count ?? null,
  }
}

export async function searchSerpApi({ q, location = '', num = 10 }) {
  const query = location ? `${q} ${location}` : q
  const params = new URLSearchParams({
    engine: 'google_maps',
    type: 'search',
    q: query,
    hl: 'es',
    num: String(num),
  })

  const res = await fetch(`/api/serp/search.json?${params}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `SerpAPI error ${res.status}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error)

  const list = Array.isArray(data.local_results)
    ? data.local_results
    : data.place_results
      ? [data.place_results]
      : []

  return list.map(normalizeLocalResult)
}
