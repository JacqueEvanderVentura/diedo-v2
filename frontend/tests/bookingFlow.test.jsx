// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AgendarPage from '@/modules/agenda/pages/AgendarPage'
import PerfilPublicoPage from '@/modules/agenda/pages/PerfilPublicoPage'
import { BookingLinkModal } from '@/modules/agenda/components/BookingLinkModal'
import { useSessionStore } from '@/stores/sessionStore'
import { useSelfBookingStore } from '@/stores/selfBookingStore'
import { publicBookingApi } from '@/services/publicBookingApi'
import { branchDateKey } from '@/modules/agenda/lib/notification'

vi.mock('@/services/publicBookingApi', () => ({ publicBookingApi: {
  getContext: vi.fn(), identify: vi.fn(), listSlots: vi.fn(), book: vi.fn(), sendBookingLink: vi.fn(),
  getAppointment: vi.fn(), managementSlots: vi.fn(), cancelAppointment: vi.fn(), rescheduleAppointment: vi.fn(),
} }))
vi.mock('@/components/customers/CustomerPicker', () => ({ CustomerPicker: () => null }))
vi.mock('@/components/ui/Select', () => ({ Select: ({ value, onChange, options, 'data-testid': testId }) =>
  <select data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Seleccionar</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>,
}))
vi.mock('@/components/ui/DatePicker', () => ({ DatePicker: ({ value, onChange, testId }) =>
  <input data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)} />,
}))

beforeEach(() => {
  vi.resetAllMocks()
  useSessionStore.setState({ status: 'anonymous', user: null })
  useSelfBookingStore.setState({ profiles: [] })
  publicBookingApi.getContext.mockResolvedValue({ branch: { branchId: 'branch', branchName: 'Norte' },
    services: [{ id: 'service', name: 'Facial', price: '1250' }],
    specialists: [{ id: 'employee', displayName: 'Ana Prueba' }], hasResources: true })
  publicBookingApi.identify.mockResolvedValue({ isNew: true })
})
afterEach(cleanup)

it('uses the establishment date when the visitor is in another timezone', () => {
  const now = new Date('2027-02-16T02:00:00Z')
  expect(branchDateKey('America/Santo_Domingo', now)).toBe('2027-02-15')
  expect(branchDateKey('Asia/Tokyo', now)).toBe('2027-02-16')
})

async function selectAppointment() {
  render(<MemoryRouter initialEntries={['/agendar?branch=branch']}><AgendarPage /></MemoryRouter>)
  await screen.findByText('Identifícate')
  fireEvent.change(screen.getByTestId('self-doc-lookup'), { target: { value: '00112345678' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await screen.findByTestId('self-name')
  fireEvent.change(screen.getByTestId('self-name'), { target: { value: 'Cliente prueba' } })
  fireEvent.change(screen.getByTestId('self-email'), { target: { value: 'client@example.com' } })
  fireEvent.click(screen.getByTestId('self-save-profile'))
  fireEvent.change(screen.getByTestId('self-service'), { target: { value: 'service' } })
  fireEvent.change(screen.getByTestId('self-specialist'), { target: { value: 'employee' } })
}

it('shares by email without a phone and never opens WhatsApp automatically', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  publicBookingApi.sendBookingLink.mockResolvedValue({ status: 'disabled', message: 'Correo desactivado.' })
  render(<MemoryRouter><BookingLinkModal open branchId="branch" branchName="Norte" onClose={() => {}} /></MemoryRouter>)
  fireEvent.change(screen.getByTestId('booking-link-name'), { target: { value: 'Cliente prueba' } })
  fireEvent.change(screen.getByTestId('booking-link-email'), { target: { value: 'client@example.com' } })
  fireEvent.click(screen.getByTestId('booking-link-send-email'))
  await screen.findByText('Correo desactivado.')
  expect(publicBookingApi.sendBookingLink).toHaveBeenCalledWith({ branchId: 'branch', name: 'Cliente prueba', email: 'client@example.com' }, expect.any(String))
  expect(open).not.toHaveBeenCalled()
  expect(screen.getByTestId('booking-link-phone').value).toBe('')
  fireEvent.change(screen.getByTestId('booking-link-phone'), { target: { value: '8294220141' } })
  fireEvent.click(screen.getByTestId('booking-link-send'))
  expect(open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/18294220141?text='), '_blank', 'noopener,noreferrer')
  expect(publicBookingApi.sendBookingLink).toHaveBeenCalledTimes(1)
  open.mockRestore()
})

it('discards an old slot response after the date changes', async () => {
  let oldResponse
  publicBookingApi.listSlots.mockImplementationOnce(() => new Promise((resolve) => { oldResponse = resolve }))
    .mockResolvedValue({ slots: ['13:00'] })
  await selectAppointment()
  await waitFor(() => expect(publicBookingApi.listSlots).toHaveBeenCalledTimes(1))
  fireEvent.change(screen.getByTestId('self-booking-date'), { target: { value: '2027-02-15' } })
  await screen.findByTestId('self-slot-13:00')
  await act(async () => oldResponse({ slots: ['10:00'] }))
  expect(screen.queryByTestId('self-slot-10:00')).toBeNull()
  expect(screen.getByTestId('self-slot-13:00')).toBeTruthy()
})

it('keeps one idempotency key when a reservation response is lost and prevents double clicks', async () => {
  publicBookingApi.listSlots.mockResolvedValue({ slots: ['10:00'] })
  publicBookingApi.book.mockRejectedValueOnce(new Error('Conexión interrumpida'))
    .mockResolvedValue({ appointment: { id: 'appointment', managementToken: 'token', notification: { status: 'failed' } } })
  await selectAppointment()
  fireEvent.click(await screen.findByTestId('self-slot-10:00'))
  fireEvent.click(screen.getByTestId('self-confirm'))
  fireEvent.click(screen.getByTestId('self-confirm'))
  await waitFor(() => expect(screen.getByTestId('self-confirm').disabled).toBe(false))
  expect(publicBookingApi.book).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByTestId('self-confirm'))
  await screen.findByText('¡Cita confirmada!')
  expect(publicBookingApi.book.mock.calls[0][2]).toBe(publicBookingApi.book.mock.calls[1][2])
  expect(screen.getByRole('link', { name: 'Gestionar mi cita' }).getAttribute('href')).toContain('token=token')
  expect(screen.getByText(/no se pudo completar el correo/)).toBeTruthy()
})

it('opens a management link without a document or administrator session', async () => {
  publicBookingApi.getAppointment.mockResolvedValue({ id: 'appointment', date: '2027-02-15', time: '10:00', durationMinutes: 45, serviceName: 'Facial', status: 'cancelled' })
  render(<MemoryRouter initialEntries={['/agendar/perfil?branch=branch&appointment=appointment&token=token']}><PerfilPublicoPage /></MemoryRouter>)
  await screen.findByText('Cancelada')
  expect(publicBookingApi.getAppointment).toHaveBeenCalledWith('branch', 'appointment', 'token')
  expect(publicBookingApi.identify).not.toHaveBeenCalled()
})
