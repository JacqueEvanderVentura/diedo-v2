import { describe, expect, it } from 'vitest'
import { buildLeadHandoffPaths, readLeadHandoffContext } from '@/modules/crm/lib/leadHandoff'

describe('leadHandoff', () => {
  it('arma rutas de cotización y cliente', () => {
    const paths = buildLeadHandoffPaths({
      leadId: 'lead-1',
      customerId: 'cust-1',
    })
    expect(paths.pipeline).toBe('/crm/pipeline')
    expect(paths.quote).toBe('/crm/cotizaciones?leadId=lead-1')
    expect(paths.customer).toBe('/crm/clientes?customerId=cust-1')
  })

  it('cotiza por cliente si no hay lead en pipeline', () => {
    const paths = buildLeadHandoffPaths({ customerId: 'cust-2' })
    expect(paths.quote).toBe('/crm/cotizaciones?customerId=cust-2')
    expect(paths.pipeline).toBeNull()
  })

  it('lee contexto del lead en el store', () => {
    const ctx = readLeadHandoffContext([
      { id: 'l1', customerId: 'c1' },
    ], 'l1')
    expect(ctx).toMatchObject({ leadId: 'l1', customerId: 'c1' })
  })
})
