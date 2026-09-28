// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { carwashApi } from '@/modules/carwash/api'
import { SettlementModal, commissionTotal } from '@/modules/carwash/components/SettlementModal'
import { ConnectedCommissionsPanel } from '@/modules/carwash/components/ConnectedCommissionsPanel'

vi.mock('@/modules/carwash/api', () => ({ carwashApi: { commissionContext: vi.fn(), commissions: vi.fn(), settlements: vi.fn(), settleCommissions: vi.fn(), reverseSettlement: vi.fn() } }))
const rows = [{ id: 'c1', employeeId: 'e1', employeeName: 'Ana', role: 'washer', service: 'Lavado', plate: 'CW-1', saleNumber: 'V-1', version: 1, status: 'pending', amount: '20.25', baseAmount: '101.25', rate: '20.00', accruedAt: '2026-09-28T02:00:00Z' }, { id: 'c2', employeeId: 'e1', employeeName: 'Ana', role: 'supervisor', service: 'Lavado', plate: 'CW-1', saleNumber: 'V-1', version: 1, status: 'pending', amount: '5.06', baseAmount: '101.25', rate: '5.00', accruedAt: '2026-09-28T02:00:00Z' }]
const context = { registerId: 'r1', canSettle: true, canReverse: true, paymentMethods: [{ id: 'cash', name: 'Efectivo' }], employees: [{ id: 'e1', name: 'Ana' }], timezone: 'America/La_Paz', currency: 'DOP' }
const props = () => ({ branchId: 'b1', rows, writable: true, money: String, onClose: vi.fn(), onSaved: vi.fn() })
beforeEach(() => {
  vi.resetAllMocks()
  carwashApi.commissionContext.mockResolvedValue(context)
  carwashApi.commissions.mockResolvedValue({ items: rows, page: 1, totalPages: 1, totalItems: 2, summary: { washes: 1, billed: '119.48', commissions: '25.31', pending: '25.31' } })
  carwashApi.settlements.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalItems: 0 })
})
afterEach(cleanup)

describe('Carwash settlements', () => {
  it('requires open cash and permission; totals use decimal cents', async () => {
    expect(commissionTotal([{ amount: '0.10' }, { amount: '0.20' }])).toBe('0.30')
    carwashApi.commissionContext.mockResolvedValue({ ...context, registerId: null })
    render(<SettlementModal {...props()} />)
    await screen.findByText(/Necesitas una caja abierta/)
    expect(screen.getByTestId('carwash-confirm-settlement').disabled).toBe(true)
    expect(screen.getByRole('link', { name: 'Abrir Caja' }).getAttribute('href')).toBe('/pos/caja')
    expect(screen.getByTestId('carwash-settlement-total').textContent).toBe('25.31')
  })
  it('recovers a lost payment response with identical key and payload', async () => {
    carwashApi.settleCommissions.mockRejectedValueOnce(new TypeError('Connection lost')).mockResolvedValueOnce({ id: 's1' })
    const callbacks = props()
    render(<SettlementModal {...callbacks} />)
    await waitFor(() => expect(screen.getByTestId('carwash-confirm-settlement').disabled).toBe(false))
    fireEvent.click(screen.getByTestId('carwash-confirm-settlement'))
    await screen.findByText(/No se confirmó la respuesta/)
    expect(screen.getByRole('button', { name: 'Cancelar' }).disabled).toBe(true)
    fireEvent.click(screen.getByText('Recuperar resultado'))
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce())
    expect(carwashApi.settleCommissions.mock.calls[1]).toEqual(carwashApi.settleCommissions.mock.calls[0])
    expect(carwashApi.settleCommissions.mock.calls[0][0]).toEqual({ branchId: 'b1', employeeId: 'e1', registerId: 'r1', paymentMethodId: 'cash', commissions: [{ id: 'c1', version: 1 }, { id: 'c2', version: 1 }] })
  })
  it('requires a reason and refreshes stale reversals', async () => {
    carwashApi.reverseSettlement.mockRejectedValue(Object.assign(new Error('La liquidación cambió'), { status: 409 }))
    const callbacks = props()
    render(<SettlementModal {...callbacks} settlement={{ id: 's1', version: 1, amount: '25.31', employeeName: 'Ana', commissions: rows }} />)
    await screen.findByText(/Caja:/)
    expect(screen.getByTestId('carwash-confirm-settlement').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Motivo del reverso'), { target: { value: 'Pago incorrecto' } })
    fireEvent.click(screen.getByTestId('carwash-confirm-settlement'))
    await screen.findByRole('alert')
    expect(screen.getByTestId('carwash-confirm-settlement').disabled).toBe(true)
    fireEvent.click(screen.getByText('Actualizar selección'))
    expect(callbacks.onSaved).toHaveBeenCalledOnce()
  })
  it('shows API summaries and retains an unavailable copy as read only', async () => {
    render(<ConnectedCommissionsPanel branchId="b1" workspace={{ defaultCurrency: 'DOP' }} params={new URLSearchParams()} updateQuery={vi.fn()} />)
    await screen.findByText('Datos sincronizados con la API.')
    expect(screen.getByText('Lavados completados').nextSibling.textContent).toBe('1')
    const checkbox = screen.getAllByRole('checkbox')[0]
    fireEvent.click(checkbox)
    expect(screen.getByTestId('carwash-open-settlement').disabled).toBe(false)
    carwashApi.commissions.mockRejectedValue(new Error('Sin conexión'))
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar', exact: true }))
    await screen.findByText('Esta copia es de solo lectura hasta recuperar la conexión.')
    expect(screen.getByTestId('carwash-open-settlement').disabled).toBe(true)
    expect(screen.getAllByRole('checkbox').every((box) => box.disabled)).toBe(true)
  })
})
