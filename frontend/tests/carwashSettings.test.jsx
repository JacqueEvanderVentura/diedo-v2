// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { buildServiceBatch, currencyFormatter, validateRates } from '@/modules/carwash/lib/settings'

vi.mock('@/modules/carwash/api', () => ({ carwashApi: { list: vi.fn(), options: vi.fn(), formOptions: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn() } }))
import { carwashApi } from '@/modules/carwash/api'
import { ServiceSettingsModal } from '@/modules/carwash/components/ServiceSettingsModal'
import { ConnectedSettingsPanel } from '@/modules/carwash/components/ConnectedSettingsPanel'

const service = { id: 'config', itemId: 'item', name: 'Lavado real', categoryName: 'Lavados', salePrice: '600.25', taxRate: '18.00', washerRate: '20.00', supervisorRate: '5.00', enabled: true, available: true, version: 1 }
const options = { canCreateServices: true, categories: [{ id: 'category', name: 'Lavados' }], units: [{ id: 'unit', name: 'Unidad', code: 'unit' }], employeeCount: 0 }

beforeEach(() => {
  vi.resetAllMocks()
  carwashApi.formOptions.mockResolvedValue(options)
  carwashApi.options.mockResolvedValue({ items: [service], totalPages: 1 })
})
afterEach(cleanup)

describe('Carwash settings', () => {
  it('validates combined rates without float precision or accepting partial numbers', () => {
    expect(validateRates({ washerRate: '99.99', supervisorRate: '0.01' })).toBeNull()
    for (const washerRate of ['100.01', '-1', 'NaN', '', '20abc', '0.001']) expect(validateRates({ washerRate, supervisorRate: '0' })).toBeTruthy()
    expect(validateRates({ washerRate: '90', supervisorRate: '10.01' })).toContain('suma')
  })
  it('keeps decimal strings and source references without duplicating price when enabling catalog items', () => {
    expect(buildServiceBatch('branch', [service], 'existing')).toEqual({ branchId: 'branch', services: [{ itemId: 'item', washerRate: '20.00', supervisorRate: '5.00' }] })
    const line = { ...service, categoryId: 'category', unitOfMeasureId: 'unit', salePrice: '0.00' }
    expect(buildServiceBatch('branch', [line], 'new').services[0].newService.salePrice).toBe('0.00')
    expect(() => buildServiceBatch('branch', [], 'existing')).toThrow()
    expect(currencyFormatter({ defaultCurrency: 'USD', locale: 'en-US' })('600.25')).toBe('$600.25')
  })
  it('retries an ambiguous creation with the exact key and payload and only reports confirmed success', async () => {
    const saved = vi.fn()
    const closed = vi.fn()
    carwashApi.create.mockRejectedValueOnce(new TypeError('Network lost')).mockResolvedValueOnce({ items: [service] })
    render(<ServiceSettingsModal branchId="branch" money={String} onClose={closed} onSaved={saved} />)
    const checkbox = await screen.findByRole('checkbox', { name: /Lavado real/ })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByTestId('carwash-save-services'))
    await screen.findByRole('alert')
    expect(saved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Comisión lavador (%)').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Cerrar', exact: true }).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('modal-close'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(closed).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('carwash-save-services'))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(carwashApi.create.mock.calls[1]).toEqual(carwashApi.create.mock.calls[0])
    expect(screen.getByRole('link', { name: /Administrar categorías/ }).target).toBe('_blank')
  })
  it('retains the draft read-only after a background failure and closes it on permission loss', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    carwashApi.list.mockResolvedValue({ items: [service], totalItems: 1, totalPages: 1, page: 1 })
    render(<ConnectedSettingsPanel branchId="branch" params={new URLSearchParams()} updateQuery={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('carwash-new-service').disabled).toBe(false))
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar Lavado real' })[0])
    const rate = await screen.findByLabelText('Comisión lavador (%)')
    fireEvent.change(rate, { target: { value: '33' } })
    carwashApi.list.mockRejectedValue(new Error('Sin conexión'))
    fireEvent(document, new Event('visibilitychange'))
    await screen.findByText('Solo lectura hasta recuperar la conexión. Tus cambios se conservan.')
    expect(rate.value).toBe('33')
    expect(rate.disabled).toBe(true)
    fireEvent.click(screen.getByTestId('carwash-save-services'))
    expect(carwashApi.update).not.toHaveBeenCalled()
    carwashApi.list.mockResolvedValue({ items: [service], totalItems: 1, totalPages: 1, page: 1 })
    fireEvent(document, new Event('visibilitychange'))
    await waitFor(() => expect(rate.disabled).toBe(false))
    expect(rate.value).toBe('33')
    carwashApi.list.mockRejectedValue(Object.assign(new Error('Sin permiso'), { status: 403 }))
    fireEvent(document, new Event('visibilitychange'))
    await waitFor(() => expect(screen.queryByTestId('carwash-service-modal')).toBeNull())
    expect(screen.queryAllByText('Lavado real')).toHaveLength(0)
    carwashApi.list.mockRejectedValue(new Error('Sin conexión'))
    fireEvent(document, new Event('visibilitychange'))
    await screen.findByText('Sin conexión')
    expect(screen.queryByText('Mostrando la última copia disponible en memoria.')).toBeNull()
  })
  it('retains stale data read-only and clears it after permission denial', async () => {
    carwashApi.list.mockResolvedValueOnce({ items: [service], totalItems: 1, totalPages: 1, page: 1 })
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockRejectedValueOnce(Object.assign(new Error('Sin permiso'), { status: 403 }))
    const updateQuery = vi.fn()
    render(<ConnectedSettingsPanel branchId="branch" params={new URLSearchParams()} updateQuery={updateQuery} />)
    await waitFor(() => expect(screen.getByTestId('carwash-new-service').disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar servicios' }))
    expect(updateQuery).not.toHaveBeenCalled()
    await screen.findByText(/Esta copia es de solo lectura/)
    expect(screen.getByTestId('carwash-services').textContent).toContain('Lavado real')
    expect(screen.getByTestId('carwash-new-service').disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText('Sin permiso')
    expect(screen.queryAllByText('Lavado real')).toHaveLength(0)
  })
})
