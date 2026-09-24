export function normalizeSettingsQuery(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function textMatches(haystack, query) {
  if (!query) return true
  const text = normalizeSettingsQuery(haystack)
  if (!text) return false
  return text.includes(query)
}

function blockSearchText(block) {
  return [block.title, ...(block.keywords || [])].filter(Boolean).join(' ')
}

function itemSearchText(item) {
  return [item.title, item.subtitle].filter(Boolean).join(' ')
}

export function isSettingsBlockVisible(visibleBlockIds, blockId) {
  if (!visibleBlockIds?.length) return true
  return visibleBlockIds.includes(blockId)
}

export function filterSettingsSections(sections, rawQuery) {
  const query = normalizeSettingsQuery(rawQuery)
  if (!query) {
    return (sections || []).map((section) => ({
      ...section,
      items: (section.items || []).map((item) => ({
        ...item,
        match: 'all',
        visibleBlockIds: null,
      })),
    }))
  }

  return (sections || []).flatMap((section) => {
    if (textMatches(section.title, query)) {
      return [
        {
          ...section,
          items: (section.items || []).map((item) => ({
            ...item,
            match: 'section',
            visibleBlockIds: null,
          })),
        },
      ]
    }

    const items = (section.items || []).flatMap((item) => {
      if (textMatches(itemSearchText(item), query)) {
        return [{ ...item, match: 'item', visibleBlockIds: null }]
      }
      const matchedBlocks = (item.blocks || []).filter((block) => textMatches(blockSearchText(block), query))
      if (!matchedBlocks.length) return []
      return [
        {
          ...item,
          match: 'block',
          visibleBlockIds: matchedBlocks.map((block) => block.id),
        },
      ]
    })

    if (!items.length) return []
    return [{ ...section, items }]
  })
}

export function shouldForceExpandSettingsItem(item, rawQuery) {
  if (!normalizeSettingsQuery(rawQuery)) return false
  return item?.match === 'item' || item?.match === 'block'
}
