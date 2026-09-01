import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  upload: vi.fn(),
  blob: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({ apiClient: mocks }))

import { posApi } from '@/services/posApi'

describe('cliente API de Terminal POS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(mocks).forEach((mock) => mock.mockResolvedValue({}))
  })

  it('consulta estado, páginas, detalles y resúmenes del contrato POS', async () => {
    await posApi.state({ branchId: 'branch-id' })
    await posApi.listQuotes({ branchId: 'branch-id' })
    await posApi.quotesSummary({ branchId: 'branch-id' })
    await posApi.getQuote('quote-id')
    await posApi.listSales({ branchId: 'branch-id', registerId: 'register-id' })
    await posApi.getRegister('register-id')
    await posApi.listRegisterMovements('register-id', { page: 2, pageSize: 50 })
    await posApi.listReceivables({ branchId: 'branch-id' })
    await posApi.receivablesSummary({ branchId: 'branch-id' })
    await posApi.getReceivable('receivable-id')

    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/state', { branchId: 'branch-id' })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/quotes', { branchId: 'branch-id' })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/quotes/summary', { branchId: 'branch-id' })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/quotes/quote-id')
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/sales', {
      branchId: 'branch-id',
      registerId: 'register-id',
    })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/registers/register-id')
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/registers/register-id/movements', {
      page: 2,
      pageSize: 50,
    })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/receivables', { branchId: 'branch-id' })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/receivables/summary', { branchId: 'branch-id' })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/pos/receivables/receivable-id')
  })

  it('preserva la clave idempotente suministrada durante una mutación', async () => {
    const payload = { branchId: 'branch-id', items: [] }
    await posApi.checkout(payload, { idempotencyKey: 'attempt-key' })
    await posApi.openRegister({ branchId: 'branch-id', openingCash: 100 }, { idempotencyKey: 'open-key' })
    await posApi.closeRegister('register-id', { countedCash: 100, version: 2 }, { idempotencyKey: 'close-key' })

    expect(mocks.post).toHaveBeenCalledWith('/api/v1/pos/checkout', payload, {
      headers: { 'Idempotency-Key': 'attempt-key' },
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/pos/registers',
      { branchId: 'branch-id', openingCash: 100 },
      { headers: { 'Idempotency-Key': 'open-key' } }
    )
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/pos/registers/register-id/close',
      { countedCash: 100, version: 2 },
      { headers: { 'Idempotency-Key': 'close-key' } }
    )
  })

  it('usa las rutas backend actuales como fallback sin cambiar la clave del intento', async () => {
    const notFound = Object.assign(new Error('No encontrado'), { status: 404 })
    mocks.post.mockRejectedValueOnce(notFound).mockResolvedValueOnce({ id: 'register-id' })

    await posApi.openRegister(
      { branchId: 'branch-id', openingCash: 100 },
      { idempotencyKey: 'same-open-key' }
    )

    expect(mocks.post.mock.calls.slice(0, 2)).toEqual([
      [
        '/api/v1/pos/registers',
        { branchId: 'branch-id', openingCash: 100 },
        { headers: { 'Idempotency-Key': 'same-open-key' } },
      ],
      [
        '/api/v1/pos/registers/open',
        { branchId: 'branch-id', openingCash: 100 },
        { headers: { 'Idempotency-Key': 'same-open-key' } },
      ],
    ])
  })

  it('registra pagos CxC en multipart sin convertir File a JSON', async () => {
    const proof = new File(['proof'], 'transferencia.pdf', { type: 'application/pdf' })
    await posApi.createReceivablePayment('receivable-id', {
      amount: 250,
      methodId: 'method-id',
      methodCode: 'transfer',
      reference: 'TRF-01',
      note: 'Abono',
      registerId: 'register-id',
      version: 3,
      proof,
    }, { idempotencyKey: 'payment-key' })

    expect(mocks.upload).toHaveBeenCalledWith(
      '/api/v1/pos/receivables/receivable-id/payments',
      expect.any(FormData),
      { headers: { 'Idempotency-Key': 'payment-key' } }
    )
    const formData = mocks.upload.mock.calls[0][1]
    expect(formData.get('amount')).toBe('250')
    expect(formData.get('methodId')).toBe('method-id')
    expect(formData.get('version')).toBe('3')
    expect(formData.get('file')).toBeInstanceOf(File)
  })

  it('sube evidencia independiente con el nombre de campo esperado por FastAPI', async () => {
    const file = new File(['proof'], 'proof.png', { type: 'image/png' })
    await posApi.uploadReceivableProof('receivable-id', {
      file,
      version: 4,
      reference: 'TRF-02',
    }, { idempotencyKey: 'proof-key' })

    const [path, formData, options] = mocks.upload.mock.calls[0]
    expect(path).toBe('/api/v1/pos/receivables/receivable-id/proofs')
    expect(formData.get('file')).toBeInstanceOf(File)
    expect(formData.get('version')).toBeNull()
    expect(formData.get('reference')).toBeNull()
    expect(options).toEqual({ headers: { 'Idempotency-Key': 'proof-key' } })
  })

  it('cancela/anula/reversa con POST y descarga comprobantes autenticados', async () => {
    await posApi.cancelQuote('quote-id', { reason: 'Cancelada', version: 1 }, { idempotencyKey: 'q-key' })
    await posApi.voidSale('sale-id', { reason: 'Error', version: 2 }, { idempotencyKey: 's-key' })
    await posApi.voidReceivable('receivable-id', { reason: 'Error', version: 3 }, { idempotencyKey: 'r-key' })
    await posApi.reversePayment('payment-id', { reason: 'Duplicado', version: 4 }, { idempotencyKey: 'p-key' })
    await posApi.downloadProof({ downloadUrl: '/api/v1/pos/files/proof-id' })

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/pos/quotes/quote-id/cancel',
      { reason: 'Cancelada', version: 1 },
      { headers: { 'Idempotency-Key': 'q-key' } }
    )
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/pos/payments/payment-id/reverse',
      { reason: 'Duplicado', version: 4 },
      { headers: { 'Idempotency-Key': 'p-key' } }
    )
    expect(mocks.blob).toHaveBeenCalledWith('/api/v1/pos/files/proof-id')
  })
})
