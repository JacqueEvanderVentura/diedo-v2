/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { posState, sessionState, crmState, toastError } = vi.hoisted(() => ({
  posState: {
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
    setState: vi.fn(),
  },
  sessionState: {
    status: 'offline',
    hasPermission: () => false,
  },
  crmState: {
    ensureSaleDetail: vi.fn(async () => null),
    ensureQuoteDetail: vi.fn(async () => null),
    quotes: [],
  },
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
    success: vi.fn(),
  },
}))

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
  const store = (selector) => selector(crmState)
  store.setState = vi.fn()
  store.getState = () => ({ sales: [], quotes: crmState.quotes })
  return { useCrmStore: store }
})

vi.mock('@/stores/posStore', () => {
  const store = (selector) => selector(posState)
  store.getState = () => posState
  store.setState = (...args) => posState.setState(...args)
  return { usePosStore: store }
})

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector) => selector(sessionState),
}))

vi.mock('@/services/posApi', () => ({
  posApi: { getReceivableForSale: vi.fn(() => Promise.reject(new Error('skip'))) },
}))

vi.mock('@/modules/pos/components/InvoicePaymentLog', () => ({
  InvoicePaymentLog: () => <div data-testid="sale-detail-payment-log-body" />,
}))

vi.mock('@/modules/crm/components/SaleEditModal', async () => {
  const { Modal } = await import('@/components/ui/Modal')
  return {
    SaleEditModal: ({ open, onClose }) => (
      <Modal open={open} onClose={onClose} nested title="Editar factura" testId="sale-edit-modal">
        edit
      </Modal>
    ),
  }
})

vi.mock('@/modules/pos/components/ReceivablePaymentModal', async () => {
  const { Modal } = await import('@/components/ui/Modal')
  return {
    ReceivablePaymentModal: ({ open, onClose }) => (
      <Modal open={open} onClose={onClose} nested title="Registrar abono" testId="cxc-payment-modal">
        pago
      </Modal>
    ),
  }
})

vi.mock('@/modules/pos/components/ReceivableProofModal', () => ({
  ReceivableProofModal: () => null,
}))

vi.mock('@/components/auth/PermissionElevationModal', () => ({
  PermissionElevationModal: () => null,
}))

import { posApi } from '@/services/posApi'
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
  soldBy: 'Carlos Vendedor',
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

beforeEach(() => {
  posState.voidSale.mockReset()
  posState.setState.mockReset()
  posApi.getReceivableForSale.mockReset()
  posApi.getReceivableForSale.mockRejectedValue(new Error('skip'))
  posState.receivables = []
  sessionState.status = 'offline'
  sessionState.hasPermission = () => false
  toastError.mockReset()
})

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
    expect(screen.getByTestId('sale-detail-sold-by').textContent).toContain('Carlos Vendedor')

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

  it('muestra registrar pago con saldo y evidencia previa, y anula sin venta en POS', async () => {
    sessionState.status = 'online'
    sessionState.hasPermission = (code) => (
      code === 'pos.receivables.collect' || code === 'sales.invoice.void'
    )
    posState.voidSale.mockResolvedValue(true)
    posState.receivables = [{
      id: 'recv-1',
      saleId: 'sale-a',
      amount: 1500,
      paidAmount: 500,
      balance: 1000,
      status: 'partial',
      proofs: [{ id: 'proof-1', name: 'voucher.png' }],
      reference: 'ABONO-1',
      payments: [{ id: 'pay-1', amount: 500, proof: { id: 'proof-1' } }],
    }]

    await act(async () => {
      render(<SaleDetailModal open onClose={vi.fn()} sale={saleA} />)
    })

    expect(screen.getByTestId('sale-detail-collect-payment')).toBeTruthy()
    expect(screen.getByTestId('sale-detail-void')).toBeTruthy()
  })

  it('abre editar, pago y anular en capa nested sobre el detalle', async () => {
    sessionState.status = 'online'
    sessionState.hasPermission = (code) => (
      code === 'pos.receivables.collect'
      || code === 'sales.invoice.void'
      || code === 'sales.invoice.edit'
    )
    posState.receivables = [{
      id: 'recv-1',
      saleId: 'sale-a',
      amount: 1500,
      paidAmount: 500,
      balance: 1000,
      status: 'partial',
      proofs: [],
      payments: [],
    }]

    await act(async () => {
      render(<SaleDetailModal open onClose={vi.fn()} sale={saleA} />)
    })

    const detailLayer = screen.getByTestId('sale-detail-modal').closest('[data-modal-layer]')
    expect(detailLayer?.getAttribute('data-modal-layer')).toBe('elevated')

    fireEvent.click(screen.getByTestId('sale-detail-collect-payment'))
    expect(screen.getByTestId('cxc-payment-modal').closest('[data-modal-layer]')?.getAttribute('data-modal-layer')).toBe('nested')

    fireEvent.click(screen.getByTestId('sale-detail-edit'))
    expect(screen.getByTestId('sale-edit-modal').closest('[data-modal-layer]')?.getAttribute('data-modal-layer')).toBe('nested')

    fireEvent.click(screen.getByTestId('sale-detail-void'))
    expect(screen.getByTestId('sale-detail-void-modal').closest('[data-modal-layer]')?.getAttribute('data-modal-layer')).toBe('nested')
  })

  it('muestra anular deshabilitado y toast sin permiso sales.invoice.void', async () => {
    await act(async () => {
      render(<SaleDetailModal open onClose={vi.fn()} sale={saleA} />)
    })

    const voidBtn = screen.getByTestId('sale-detail-void')
    expect(voidBtn).toBeTruthy()
    expect(voidBtn.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(voidBtn)
    expect(toastError).toHaveBeenCalledWith('Solicita permisos a tu superior inmediato para anular.')
    expect(screen.queryByTestId('sale-detail-void-modal')).toBeNull()
  })

  it('no vuelve a pedir el receivable cuando el store de CxC se actualiza', async () => {
    sessionState.status = 'online'
    posApi.getReceivableForSale.mockImplementation(async (saleId) => ({
      id: `recv-${saleId}`,
      saleId,
      amount: 1500,
      paidAmount: 0,
      balance: 1500,
      status: 'pending',
    }))

    const onClose = vi.fn()
    const view = render(<SaleDetailModal open onClose={onClose} sale={saleA} />)
    await act(async () => {})
    expect(posApi.getReceivableForSale).toHaveBeenCalledTimes(1)
    expect(posApi.getReceivableForSale).toHaveBeenCalledWith('sale-a')

    posState.receivables = [{
      id: 'recv-sale-a',
      saleId: 'sale-a',
      amount: 1500,
      paidAmount: 0,
      balance: 1500,
      status: 'pending',
    }]
    await act(async () => {
      view.rerender(<SaleDetailModal open onClose={onClose} sale={{ ...saleA }} />)
    })
    expect(posApi.getReceivableForSale).toHaveBeenCalledTimes(1)

    await act(async () => {
      view.rerender(<SaleDetailModal open onClose={onClose} sale={saleB} />)
    })
    expect(posApi.getReceivableForSale).toHaveBeenCalledTimes(2)
    expect(posApi.getReceivableForSale).toHaveBeenLastCalledWith('sale-b')

    await act(async () => {
      view.rerender(<SaleDetailModal open={false} onClose={onClose} sale={null} />)
    })
    expect(posApi.getReceivableForSale).toHaveBeenCalledTimes(2)
  })
})
