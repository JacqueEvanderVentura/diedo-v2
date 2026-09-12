import { describe, expect, it } from 'vitest'
import {
  aggregateDividendRows,
  buildDividendCsv,
  buildPartnerPayrollCsv,
} from '@/modules/reportes/lib/dividendsReport'

describe('dividendsReport', () => {
  const rows = [
    {
      partnerName: 'Ana',
      cedula: '001',
      branchId: 'b1',
      branchName: 'Sucursal A',
      share: 60,
      dividend: 600,
      totalBranchProfit: 1000,
    },
    {
      partnerName: 'Luis',
      cedula: '002',
      branchId: 'b1',
      branchName: 'Sucursal A',
      share: 40,
      dividend: 400,
      totalBranchProfit: 1000,
    },
  ]

  it('agrega socios y sucursales para gráficos', () => {
    const analytics = aggregateDividendRows(rows)
    expect(analytics.byPartner).toHaveLength(2)
    expect(analytics.byBranch).toHaveLength(1)
    expect(analytics.totals.totalDividends).toBe(1000)
    expect(analytics.partnerChart[0].name).toBe('Ana')
  })

  it('genera CSV de detalle y nómina', () => {
    const analytics = aggregateDividendRows(rows)
    expect(buildDividendCsv(rows)).toContain('"Ana"')
    expect(buildPartnerPayrollCsv(analytics.byPartner)).toContain('"Luis"')
  })
})
