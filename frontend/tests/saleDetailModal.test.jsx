/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const posState = {
  voidSale: vi.fn(),
  deleteSale: vi.fn(),
  downloadPaymentProof: vi.fn(),
  reversePayment: vi.fn(),
  approveReceivablePayment: vi.fn(),
  unapproveReceivablePayment: vi.fn(),
  deleteReceivableProof: vi.fn(),
  attachReceivableProof: vi.fn(),
  receivables: [],
  mutating: false,
}

vi.mock('@/stores/configStore', () => ({
  useConfigStore: (selector) => selector({
    branches: [{ id: 'branch-1', name: 'MAIN' }],
    settings: {},
    paymentMethods: [],
  }),
}))

vi.mock('@/stores/customersStore', () => ({
  useCustomersStore: (selector) => selector({ customers: [] }),
}))

vi.mock('@/stores/crmStore', () => {
  const store = (selector) => selector({
    ensureSaleDetail: vi.fn(async () => null),
    ensureQuoteDetail: vi.fn(async () => null),
    quotes: [],
  })
  store.setState = vi.fn()
  store.getState = () => ({ sales: [] })
  return { useCrmStore: store }
})

vi.mock('@/stores/posStore', () => {
  const store = (selector) => selector(posState)
  store.getState = () => posState
  return { usePosStore: store }
})

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector) => selector({
    status: 'offline',
    hasPermission: () => false,
  }),
}))

vi.mock('@/services/posApi', () => ({
  posApi: { getReceivableForSale: vi.fn(() => Promise.reject(new Error('skip'))) },
}))

vi.mock('@/modules/pos/components/InvoicePaymentLog', () => ({
  InvoicePaymentLog: () => <div data-testid="sale-detail-payment-log-body" />,
}))

vi.mock('@/modules/crm/components/SaleEditModal', () => ({
  SaleEditModal: () => null,
}))

vi.mock('@/modules/pos/components/ReceivablePaymentModal', () => ({
  ReceivablePaymentModal: () => null,
}))

vi.mock('@/modules/pos/components/ReceivableProofModal', () => ({
  ReceivableProofModal: () => null,
}))

vi.mock('@/components/auth/PermissionElevationModal', () => ({
  PermissionElevationModal: () => null,
}))

import { SaleDetailModal } from '@/modules/crm/components/SaleDetailModal'

const saleA = {
  id: 'sale-a',
  number: 'F-001',
  method: 'efectivo',
  total: 1500,
  createdAt: '2026-10-01T12:00:00.000Z',
  branchId: 'branch-1',
  items: [{ name: 'Corte', qty: 1, price: 1500 }],
  customer: { name: 'Ana Pérez' },
}

const saleB = {
  id: 'sale-b',
  number: 'F-002',
  method: 'tarjeta',
  reference: 'POS-99',
  total: 800,
  createdAt: '2026-10-02T15:30:00.000Z',
  branchId: 'branch-1',
  items: [{ name: 'Tinte', qty: 1, price: 800 }],
  customer: { name: 'Luis Gómez' },
}

afterEach(() => {
  cleanup()
})

describe('SaleDetailModal', () => {
  it('no tira al reabrir otra venta con detail aún null', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<SaleDetailModal open={false} onClose={onClose} sale={null} />)

    await act(async () => {
      rerender(<SaleDetailModal open onClose={onClose} sale={saleA} />)
    })
    expect(screen.getByTestId('sale-detail-id').textContent).toBe('F-001')
    expect(screen.getByTestId('sale-detail-modal').textContent).toContain('Efectivo')

    await act(async () => {
      rerender(<SaleDetailModal open={false} onClose={onClose} sale={null} />)
    })
    expect(screen.queryByTestId('sale-detail-id')).toBeNull()

    await act(async () => {
      rerender(<SaleDetailModal open onClose={onClose} sale={saleB} />)
    })
    expect(screen.getByTestId('sale-detail-id').textContent).toBe('F-002')
    expect(screen.getByTestId('sale-detail-modal').textContent).toContain('Tarjeta')
    expect(screen.getByTestId('sale-detail-modal').textContent).toContain('Luis Gómez')
  })
})
