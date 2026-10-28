// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('@/components/customers/CustomerPicker', () => ({
  CustomerPicker: ({ onChange, branchId, testIdPrefix }) => (
    <button
      type="button"
      data-testid={`${testIdPrefix}-stub`}
      data-branch={branchId || ''}
      onClick={() => onChange({ id: 'c-pick', name: 'Cliente Elegido' })}
    >
      elegir cliente
    </button>
  ),
}))

vi.mock('@/modules/pos/components/PaymentMethodPicker', () => ({
  PaymentMethodPicker: ({ value }) => <span data-testid="payment-picker-stub">{value}</span>,
}))

vi.mock('@/modules/pos/components/PaymentEvidenceFields', () => ({
  PaymentEvidenceFields: () => null,
}))

import { CloseLeadInvoiceModal } from '@/modules/crm/components/CloseOpportunityInvoiceModal'

const lead = { id: 'lead-1', branchId: 'b1', name: 'Ana', company: 'Spa Zen', customerId: null, status: 'propuesta' }
const quote = {
  id: 'q-1',
  leadId: 'lead-1',
  number: 'COT-1',
  status: 'aceptada',
  total: 1000,
  items: [{ id: 'i1', name: 'Servicio', qty: 1, price: 1000 }],
}
const efectivo = { id: 'efectivo', name: 'Efectivo', enabled: true, apiId: 'pm-1' }

function renderModal(props = {}) {
  const handlers = {
    onClose: vi.fn(),
    onCreateQuote: vi.fn(),
    onLinkQuote: vi.fn(),
    onConfirm: vi.fn(),
    onLinkCustomer: vi.fn().mockResolvedValue(undefined),
    onCloseWithoutInvoice: vi.fn().mockResolvedValue(undefined),
    onPaymentMethodChange: vi.fn(),
  }
  render(
    <CloseLeadInvoiceModal
      open
      lead={lead}
      quotes={[quote]}
      branches={[{ id: 'b1', name: 'Centro' }]}
      customers={[]}
      paymentMethods={[efectivo]}
      paymentMethod="efectivo"
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, ...props }
}

describe('CloseLeadInvoiceModal', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('busca clientes en la sucursal del lead y los vincula al elegirlos', async () => {
    const { onLinkCustomer } = renderModal()
    const picker = screen.getByTestId('pipeline-close-link-customer-stub')
    expect(picker.dataset.branch).toBe('b1')
    expect(screen.getByTestId('pipeline-close-confirm').disabled).toBe(true)
    expect(screen.queryByTestId('pipeline-close-without-invoice')).toBeNull()

    fireEvent.click(picker)
    await waitFor(() => expect(onLinkCustomer).toHaveBeenCalledWith('c-pick'))
  })

  it('muestra el error cuando no se puede vincular el cliente', async () => {
    renderModal({ onLinkCustomer: vi.fn().mockRejectedValue(new Error('El lead está vinculado a otro cliente.')) })
    fireEvent.click(screen.getByTestId('pipeline-close-link-customer-stub'))
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('El lead está vinculado a otro cliente.'))
  })

  it('usa el cliente de la cotización y confirma el cierre sin factura', async () => {
    const { onCloseWithoutInvoice } = renderModal({
      quotes: [{ ...quote, customerId: 'c-1', customerName: 'Spa Zen SRL' }],
    })
    expect(screen.getByText('Spa Zen SRL')).toBeTruthy()
    expect(screen.queryByTestId('pipeline-close-link-customer-stub')).toBeNull()

    fireEvent.click(screen.getByTestId('pipeline-close-without-invoice'))
    expect(screen.getByTestId('pipeline-close-manual-warning')).toBeTruthy()
    expect(onCloseWithoutInvoice).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('pipeline-close-without-invoice'))
    await waitFor(() => expect(onCloseWithoutInvoice).toHaveBeenCalledWith({ customerId: 'c-1' }))
  })

  it('muestra el error del cierre manual', async () => {
    renderModal({
      lead: { ...lead, customerId: 'c-1' },
      onCloseWithoutInvoice: vi.fn().mockRejectedValue(new Error('No permitido')),
    })
    fireEvent.click(screen.getByTestId('pipeline-close-without-invoice'))
    fireEvent.click(screen.getByTestId('pipeline-close-without-invoice'))
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No permitido'))
  })

  it('no ofrece cierre manual cuando la cotización ya tiene venta', () => {
    renderModal({
      lead: { ...lead, customerId: 'c-1' },
      quotes: [{ ...quote, customerId: 'c-1', convertedSaleId: 'sale-1' }],
    })
    expect(screen.queryByTestId('pipeline-close-without-invoice')).toBeNull()
  })

  it('elige el primer método habilitado cuando no hay uno válido', () => {
    const { onPaymentMethodChange } = renderModal({
      paymentMethod: 'tarjeta',
      paymentMethods: [{ ...efectivo, id: 'tarjeta', enabled: false }, efectivo],
    })
    expect(onPaymentMethodChange).toHaveBeenCalledWith('efectivo')
  })

  it('factura con el método elegido', () => {
    const { onConfirm } = renderModal({ lead: { ...lead, customerId: 'c-1' } })
    fireEvent.click(screen.getByTestId('pipeline-close-confirm'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'c-1',
      paymentMethod: 'efectivo',
    }))
  })

  it('avisa en lugar de fallar si el método no está sincronizado', () => {
    const { onConfirm } = renderModal({
      lead: { ...lead, customerId: 'c-1' },
      paymentMethods: [{ ...efectivo, apiId: null }],
    })
    fireEvent.click(screen.getByTestId('pipeline-close-confirm'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining('no está sincronizado'))
  })
})
