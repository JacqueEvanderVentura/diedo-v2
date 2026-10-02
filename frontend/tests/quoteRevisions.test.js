import { describe, expect, it } from 'vitest'
import { appendQuoteRevision, buildQuoteRevisionSnapshot } from '@/modules/crm/lib/quoteRevisions'

describe('quoteRevisions', () => {
  it('agrega snapshots con líneas', () => {
    const quote = {
      number: 'COT-1',
      status: 'borrador',
      customerName: 'Test',
      total: 100,
      items: [{ name: 'Servicio', qty: 1, price: 100 }],
    }
    const snapshot = buildQuoteRevisionSnapshot(quote)
    expect(snapshot.lines).toHaveLength(1)
    const revisions = appendQuoteRevision(quote, 'created')
    expect(revisions).toHaveLength(1)
    expect(revisions[0].event).toBe('created')
  })
})
