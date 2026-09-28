// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { carwashApi } from '@/modules/carwash/api'
import { posApi } from '@/services/posApi'
import { WashCheckoutModal } from '@/modules/carwash/components/WashCheckoutModal'

vi.mock('@/modules/carwash/api', () => ({ carwashApi: { checkoutContext: vi.fn(), previewWash: vi.fn(), washAction: vi.fn() } }))
vi.mock('@/services/posApi', () => ({ posApi: { uploadReceivableProof: vi.fn() } }))
const wash = { id: 'wash', version: 2, status: 'washing', plate: 'CW-123', customerName: 'Cliente', paymentMethodId: 'cash', lines: [{ id: 'line', name: 'Lavado', unitPrice: '100.00', taxRate: '18' }] }
const preview = { subtotal: '100.00', discountAmount: '0.00', taxAmount: '18.00', total: '118.00' }
const completed = { ...wash, status: 'completed', saleId: 'sale', saleNumber: 'V-1', finalTotal: '118.00' }
const context = { wash, registerId: 'register', canDiscount: true, canUploadProof: true, paymentMethods: [{ id: 'cash', name: 'Efectivo', settlementPolicy: 'immediate' }, { id: 'transfer', name: 'Transferencia', settlementPolicy: 'pending_confirmation', requiresEvidence: true }] }
const props = () => ({ wash, writable: true, money: String, onClose: vi.fn(), onSaved: vi.fn() })
beforeEach(() => { vi.resetAllMocks(); carwashApi.checkoutContext.mockResolvedValue(context); carwashApi.previewWash.mockResolvedValue(preview) })
afterEach(cleanup)

describe('Carwash billing', () => {
  it('requires an open branch register and uses the server preview', async () => {
    carwashApi.checkoutContext.mockResolvedValue({ ...context, registerId: null })
    render(<WashCheckoutModal {...props()} />)
    await screen.findByText(/Necesitas una caja abierta/)
    expect(screen.getByRole('link', { name: 'Abrir Caja' }).getAttribute('href')).toBe('/pos/caja')
    await screen.findByTestId('carwash-checkout-total')
    expect(screen.getByTestId('carwash-confirm-checkout').disabled).toBe(true)
    fireEvent.click(screen.getByTestId('carwash-confirm-checkout'))
    expect(carwashApi.washAction).not.toHaveBeenCalled()
  })
  it('freezes an ambiguous completion and replays the same version, key and payload', async () => {
    carwashApi.washAction.mockRejectedValueOnce(new TypeError('Network lost')).mockResolvedValueOnce(completed)
    const callbacks = props()
    render(<WashCheckoutModal {...callbacks} />)
    await waitFor(() => expect(screen.getByTestId('carwash-confirm-checkout').disabled).toBe(false))
    fireEvent.change(screen.getByLabelText('Valor del descuento'), { target: { value: '10' } })
    expect(screen.getByTestId('carwash-confirm-checkout').disabled).toBe(true)
    await waitFor(() => expect(screen.getByTestId('carwash-confirm-checkout').disabled).toBe(false))
    fireEvent.click(screen.getByTestId('carwash-confirm-checkout'))
    await screen.findByText(/No se confirmó la respuesta/)
    expect(screen.getByLabelText('Valor del descuento').closest('fieldset').disabled).toBe(true)
    fireEvent.click(screen.getByText('Recuperar resultado'))
    await screen.findByText(/Factura V-1/)
    expect(carwashApi.washAction.mock.calls[1]).toEqual(carwashApi.washAction.mock.calls[0])
    expect(carwashApi.washAction.mock.calls[0][2]).toMatchObject({ version: 2, discountType: 'percent', discountValue: '10', registerId: 'register' })
    expect(callbacks.onSaved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Cerrar y actualizar'))
    expect(callbacks.onSaved).toHaveBeenCalledOnce()
  })
  it('retries a failed attachment without repeating checkout', async () => {
    carwashApi.washAction.mockResolvedValue({ ...completed, receivableId: 'debt' })
    posApi.uploadReceivableProof.mockRejectedValueOnce(new Error('Upload failed')).mockResolvedValueOnce({ id: 'proof' })
    render(<WashCheckoutModal {...props()} />)
    await waitFor(() => expect(screen.getByTestId('carwash-confirm-checkout').disabled).toBe(false))
    fireEvent.click(screen.getByText('Transferencia'))
    const proof = new File(['proof'], 'proof.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('carwash-evidence-file'), { target: { files: [proof] } })
    fireEvent.click(screen.getByTestId('carwash-confirm-checkout'))
    await screen.findByText('La venta ya está guardada. Reintentar solo enviará el comprobante.')
    fireEvent.click(screen.getByText('Reintentar comprobante'))
    await screen.findByText('Comprobante adjuntado.')
    expect(carwashApi.washAction).toHaveBeenCalledOnce()
    expect(posApi.uploadReceivableProof).toHaveBeenCalledTimes(2)
    expect(posApi.uploadReceivableProof).toHaveBeenLastCalledWith('debt', { file: proof })
  })
  it('blocks stale version and does not expose unauthorized discounts', async () => {
    carwashApi.checkoutContext.mockResolvedValue({ ...context, canDiscount: false })
    carwashApi.washAction.mockRejectedValue(Object.assign(new Error('El lavado cambió'), { status: 409 }))
    const callbacks = props()
    render(<WashCheckoutModal {...callbacks} />)
    await waitFor(() => expect(screen.getByTestId('carwash-confirm-checkout').disabled).toBe(false))
    expect(screen.queryByLabelText('Valor del descuento')).toBeNull()
    fireEvent.click(screen.getByTestId('carwash-confirm-checkout'))
    await screen.findByRole('alert')
    expect(screen.getByTestId('carwash-confirm-checkout').disabled).toBe(true)
    fireEvent.click(screen.getByText('Volver'))
    expect(callbacks.onSaved).toHaveBeenCalledOnce()
  })
})
