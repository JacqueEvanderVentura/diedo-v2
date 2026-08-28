function normalizePlace(item) {
  return {
    name: item.title || 'Sin nombre',
    company: item.title || '',
    phone: item.phoneNumber || item.phone || null,
    website: item.website || item.link || null,
    location: item.address || '',
    sourceUrl: item.link || item.cid || null,
    rawSnippet: [item.category, item.description].filter(Boolean).join(' · '),
    rating: item.rating ?? null,
    reviews: item.ratingCount ?? null,
  }
}

export async function searchSerperApi({ q, location = '', num = 10 }) {
  const query = location ? `${q} ${location}` : q
  const res = await fetch('/api/serper/places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Serper error ${res.status}`)
  }

  const data = await res.json()
  const places = data.places || []
  return places.map(normalizePlace)
}
