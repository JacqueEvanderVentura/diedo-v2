import { describe, expect, it, vi } from 'vitest'
import { readAllPages } from '@/services/pagination'
import { fmtDate } from '@/modules/crm/lib/crm'
import { findBillableQuote } from '@/modules/crm/lib/pipelineInvoice'

describe('regresiones de auditoría CRM', () => {
  it.each([0, 1, 200, 201, 206, 1000])('conserva %i registros y busca fuera de la primera página', async (count) => {
    const records = Array.from({ length: count }, (_, id) => ({ id: String(id), name: `Lead ${id}` }))
    const read = vi.fn(async ({ page, pageSize }) => ({
      items: records.slice((page - 1) * pageSize, page * pageSize),
      totalItems: count, totalPages: Math.ceil(count / pageSize),
    }))
    const result = await readAllPages(read, { branchId: 'authorized-branch' })
    expect(result.items).toEqual(records)
    if (count > 200) expect(result.items.find((row) => row.name === 'Lead 200')).toBeDefined()
    for (const [query] of read.mock.calls) expect(query.branchId).toBe('authorized-branch')
  })

  it('no presenta una colección parcial como completa cuando falla una página', async () => {
    const read = vi.fn().mockResolvedValueOnce({ items: [{ id: '1' }], totalPages: 2 })
      .mockRejectedValueOnce(new Error('Sin conexión'))
    await expect(readAllPages(read)).rejects.toThrow('Sin conexión')
  })

  it.each(['America/La_Paz', 'America/Santo_Domingo', 'Asia/Tokyo'])('conserva fechas de calendario en %s', (zone) => {
    const before = process.env.TZ
    try {
      process.env.TZ = zone
      expect(fmtDate('2026-09-15')).toBe('15 sep 2026')
      expect(fmtDate('2027-01-01')).toBe('01 ene 2027')
      expect(fmtDate(null)).toBe('—')
    } finally { process.env.TZ = before }
  })

  it('prioriza la factura existente para cerrar y excluye cotizaciones rechazadas/vencidas', () => {
    const base = { opportunityId: 'opp', items: [{ name: 'Servicio' }] }
    const invoiced = { ...base, id: 'invoiced', convertedSaleId: 'sale', status: 'aceptada' }
    expect(findBillableQuote([{ ...base, id: 'draft', status: 'borrador' }, invoiced], 'opp')).toBe(invoiced)
    expect(findBillableQuote([{ ...base, status: 'rechazada' }, { ...base, status: 'vencida' }], 'opp')).toBeNull()
  })
})
