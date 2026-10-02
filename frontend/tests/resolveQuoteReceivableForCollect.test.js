import { describe, expect, it, vi } from 'vitest'
import { resolveQuoteReceivableForCollect } from '@/modules/crm/lib/resolveQuoteReceivableForCollect'

describe('resolveQuoteReceivableForCollect', () => {
  it('usa getReceivableForSale cuando el id local no existe en el store', async () => {
    const ensureReceivableDetail = vi.fn().mockRejectedValue(new Error('404'))
    const getReceivableForSale = vi.fn().mockResolvedValue({
      id: 'recv-real',
      saleId: 'sale-1',
      apiSynced: true,
      detailLoaded: true,
    })

    const result = await resolveQuoteReceivableForCollect({
      row: { id: 'stale-id', saleId: 'sale-1' },
      quote: { id: 'q1', receivableId: 'stale-id', invoiceNumber: 'VTA-1' },
      sales: [{ id: 'sale-1', number: 'VTA-1' }],
      receivables: [],
      isOnline: true,
      ensureReceivableDetail,
      getReceivableForSale,
    })

    expect(getReceivableForSale).toHaveBeenCalledWith('sale-1')
    expect(result?.id).toBe('recv-real')
  })

  it('prioriza match por saleId en el store', async () => {
    const result = await resolveQuoteReceivableForCollect({
      row: { quoteId: 'q1' },
      quote: { id: 'q1', convertedSaleId: 'sale-9' },
      sales: [{ id: 'sale-9', number: 'VTA-9' }],
      receivables: [{ id: 'recv-9', saleId: 'sale-9', apiSynced: true, detailLoaded: true }],
      isOnline: false,
    })

    expect(result?.id).toBe('recv-9')
  })
})
