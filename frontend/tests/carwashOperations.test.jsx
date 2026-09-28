// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/modules/carwash/api', () => ({ carwashApi: { washes: vi.fn(), wash: vi.fn(), operationContext: vi.fn(), washOptions: vi.fn(), createWash: vi.fn(), updateWash: vi.fn(), washAction: vi.fn() } }))
vi.mock('@/modules/crm/components/CustomerFormModal', () => ({ CustomerFormModal: () => null }))
import { carwashApi } from '@/modules/carwash/api'
import { ConnectedOperationsPanel } from '@/modules/carwash/components/ConnectedOperationsPanel'
import { WashFormModal } from '@/modules/carwash/components/WashFormModal'
import { WashActionModal } from '@/modules/carwash/components/WashActionModal'

const wash = { id: 'wash', version: 1, branchId: 'branch', plate: 'CW-123', customerId: 'customer', customerName: 'Cliente real', washerId: 'employee', washerName: 'Ana', supervisorId: 'employee', supervisorName: 'Ana', status: 'waiting', currency: 'DOP', timezone: 'America/La_Paz', createdAt: '2026-09-28T12:00:00Z', total: '118.00', lines: [{ id: 'line', serviceConfigId: 'service', name: 'Lavado real', unitPrice: '100.00', taxRate: '18.00', taxAmount: '18.00', total: '118.00' }] }
const context = { canManage: true, canCreateCustomer: true, canConfigureServices: true, canManageEmployees: true }
const page = { items: [wash], page: 1, totalPages: 1, totalItems: 1 }
const panelProps = () => ({ branchId: 'branch', scopeKey: 'scope', params: new URLSearchParams(), updateQuery: vi.fn(), onAvailability: vi.fn(), openRequest: 0 })
beforeEach(() => {
  vi.resetAllMocks()
  carwashApi.washes.mockResolvedValue(page)
  carwashApi.operationContext.mockResolvedValue(context)
  carwashApi.washOptions.mockResolvedValue({ items: [], totalPages: 0 })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Carwash operational reception', () => {
  it('preserves stale rows read-only and clears them on permission denial', async () => {
    carwashApi.washes.mockResolvedValueOnce(page).mockRejectedValueOnce(new Error('Sin conexión')).mockRejectedValueOnce(Object.assign(new Error('Sin permiso'), { status: 403 }))
    const props = panelProps()
    render(<ConnectedOperationsPanel {...props} />)
    await waitFor(() => expect(props.onAvailability).toHaveBeenLastCalledWith({ scopeKey: 'scope', writable: true }))
    expect(screen.getAllByRole('button', { name: 'Completar' }).every((button) => button.disabled)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar lavados' }))
    await screen.findByText(/Esta copia es de solo lectura/)
    expect(screen.getByTestId('carwash-washes').textContent).toContain('CW-123')
    expect(screen.getAllByRole('button', { name: 'Editar' }).every((button) => button.disabled)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText('Sin permiso')
    expect(screen.getByTestId('carwash-washes').textContent).not.toContain('CW-123')
  })
  it('polls only while visible and stops when unmounted', async () => {
    vi.useFakeTimers()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const view = render(<ConnectedOperationsPanel {...panelProps()} />)
    await act(async () => {})
    expect(carwashApi.washes).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(carwashApi.washes).toHaveBeenCalledTimes(2)
    visibility.mockReturnValue('hidden')
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(carwashApi.washes).toHaveBeenCalledTimes(2)
    visibility.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(carwashApi.washes).toHaveBeenCalledTimes(3)
    view.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(carwashApi.washes).toHaveBeenCalledTimes(3)
    visibility.mockRestore()
  })
  it('uses versioned server-authoritative edits and freezes an ambiguous request until retry', async () => {
    const saved = vi.fn()
    carwashApi.updateWash.mockRejectedValueOnce(new TypeError('Network lost')).mockResolvedValueOnce(wash)
    render(<WashFormModal branchId="branch" wash={wash} context={context} writable money={String} onClose={() => {}} onSaved={saved} />)
    fireEvent.change(screen.getByLabelText('Placa'), { target: { value: 'CW-456' } })
    fireEvent.click(screen.getByTestId('carwash-save-wash'))
    await screen.findByRole('alert')
    expect(saved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Placa').disabled).toBe(true)
    expect(carwashApi.updateWash.mock.calls[0][1]).toMatchObject({ version: 1, plate: 'CW-456', serviceIds: ['service'] })
    expect(carwashApi.updateWash.mock.calls[0][1]).not.toHaveProperty('total')
    expect(carwashApi.updateWash.mock.calls[0][1]).not.toHaveProperty('unitPrice')
    fireEvent.click(screen.getByTestId('carwash-save-wash'))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(carwashApi.updateWash.mock.calls[0]).toEqual(carwashApi.updateWash.mock.calls[1])
    expect(screen.getByRole('link', { name: /Configurar o crear servicios/ }).getAttribute('href')).toBe('/carwash?tab=configuracion&branchId=branch')
  })
  it('does not apply a late response from a previous branch', async () => {
    let resolve
    carwashApi.washes.mockReturnValueOnce(new Promise((done) => { resolve = done })).mockResolvedValueOnce({ ...page, items: [] })
    const props = panelProps()
    const view = render(<ConnectedOperationsPanel key="one" {...props} />)
    view.rerender(<ConnectedOperationsPanel key="two" {...props} branchId="other" scopeKey="other" />)
    await waitFor(() => expect(props.onAvailability).toHaveBeenLastCalledWith({ scopeKey: 'other', writable: true }))
    await act(async () => { resolve(page) })
    expect(screen.getByTestId('carwash-washes').textContent).not.toContain('CW-123')
  })
  it('reuses cancellation key and reason after a lost response', async () => {
    const saved = vi.fn()
    carwashApi.washAction.mockRejectedValueOnce(new TypeError('Network lost')).mockResolvedValueOnce({ ...wash, status: 'cancelled' })
    render(<WashActionModal wash={wash} action="cancel" writable onClose={() => {}} onSaved={saved} />)
    fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: 'Cliente se retiró' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Motivo de cancelación').disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar acción' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(carwashApi.washAction.mock.calls[1]).toEqual(carwashApi.washAction.mock.calls[0])
  })
})
