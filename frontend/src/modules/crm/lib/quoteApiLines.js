export function mapQuoteItemToApiLine(item) {
  if (item.kind === 'section') {
    return {
      kind: 'section',
      title: item.title || item.name,
    }
  }
  return {
    kind: 'item',
    itemId: item.itemId || item.id,
    quantity: item.qty || 1,
    unitPrice: Number(item.price) || 0,
  }
}
