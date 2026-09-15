/** Read a complete authorized collection through the API's pagination contract. */
export async function readAllPages(readPage, params = {}) {
  const first = await readPage({ ...params, page: 1, pageSize: params.pageSize || 200 })
  const items = [...(first?.items || [])]
  for (let page = 2; page <= (first?.totalPages || 1); page += 1) {
    const next = await readPage({ ...params, page, pageSize: params.pageSize || 200 })
    items.push(...(next?.items || []))
  }
  return { ...first, items: [...new Map(items.map((item) => [item.id || item.quote?.id, item])).values()] }
}
