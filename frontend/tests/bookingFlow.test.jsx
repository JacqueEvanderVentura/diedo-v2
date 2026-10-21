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
import { publicPortalApi } from '@/services/publicPortalApi'
import { clearPublicSession, rememberPublicSession } from '@/modules/portal/lib/publicSession'
import { branchDateKey } from '@/modules/agenda/lib/notification'

vi.mock('@/services/publicBookingApi', () => ({ publicBookingApi: {
  getContext: vi.fn(), getEntryContext: vi.fn(), identify: vi.fn(), listSlots: vi.fn(), book: vi.fn(), sendBookingLink: vi.fn(),
  getAppointment: vi.fn(), managementSlots: vi.fn(), cancelAppointment: vi.fn(), rescheduleAppointment: vi.fn(),
} }))
vi.mock('@/services/publicPortalApi', () => ({
  publicPortalApi: { register: vi.fn().mockResolvedValue({ customerId: 'cust-1' }) },
}))
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
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    callback()
    return 0
  })
  clearPublicSession()
  useSessionStore.setState({ status: 'online', user: null })
  useSelfBookingStore.setState({ profiles: [] })
  publicBookingApi.getContext.mockResolvedValue({
    branch: { branchId: 'branch', branchName: 'Norte', timezone: 'America/Santo_Domingo' },
    services: [{ id: 'service', name: 'Facial', price: '1250', durationMinutes: 30 }],
    specialists: [{ id: 'employee', displayName: 'Ana Prueba' }],
    hasResources: true,
    workspaceBranches: [{ id: 'branch', name: 'Norte' }],
  })
  publicBookingApi.identify.mockResolvedValue({ isNew: true })
})
afterEach(cleanup)

it('uses the establishment date when the visitor is in another timezone', () => {
  const now = new Date('2027-02-16T02:00:00Z')
  expect(branchDateKey('America/Santo_Domingo', now)).toBe('2027-02-15')
  expect(branchDateKey('Asia/Tokyo', now)).toBe('2027-02-16')
})

async function selectAppointment() {
  render(<MemoryRouter initialEntries={['/agendar?branch=branch&intent=book']}><AgendarPage /></MemoryRouter>)
  await screen.findByText('Elige tu sucursal')
  fireEvent.click(screen.getByTestId('branch-confirm'))
  await screen.findByText(/Ingresa tu documento/)
  fireEvent.change(screen.getByTestId('self-doc-lookup'), { target: { value: '00112345678' } })
  fireEvent.click(screen.getByText('Regístrate aquí'))
  await screen.findByTestId('self-name')
  fireEvent.change(screen.getByTestId('self-name'), { target: { value: 'Cliente prueba' } })
  fireEvent.click(screen.getByTestId('pref-invite-invoice'))
  fireEvent.change(screen.getByTestId('self-email'), { target: { value: 'client@example.com' } })
  fireEvent.click(screen.getByTestId('self-save-profile'))
  await screen.findByTestId('self-service')
  fireEvent.change(screen.getByTestId('self-service'), { target: { value: 'service' } })
  fireEvent.change(screen.getByTestId('self-specialist'), { target: { value: 'employee' } })
}

it('shares by email without a phone and never opens WhatsApp automatically', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  publicBookingApi.sendBookingLink.mockResolvedValue({ status: 'disabled', message: 'Correo desactivado.' })
  publicBookingApi.getEntryContext.mockResolvedValue({
    workspaceName: 'Mi establecimiento',
    workspaceBranches: [{ id: 'branch', name: 'Norte' }],
  })
  render(<MemoryRouter><BookingLinkModal open onClose={() => {}} /></MemoryRouter>)
  fireEvent.change(screen.getByTestId('booking-link-name'), { target: { value: 'Cliente prueba' } })
  fireEvent.change(screen.getByTestId('booking-link-email'), { target: { value: 'client@example.com' } })
  fireEvent.click(screen.getByTestId('booking-link-send-email'))
  await screen.findByText('Correo desactivado.')
  expect(publicBookingApi.sendBookingLink).toHaveBeenCalledWith({ name: 'Cliente prueba', email: 'client@example.com' }, expect.any(String))
  expect(open).not.toHaveBeenCalled()
  expect(screen.getByTestId('booking-link-phone').value).toBe('')
  fireEvent.change(screen.getByTestId('booking-link-phone'), { target: { value: '8294220141' } })
  fireEvent.click(screen.getByTestId('booking-link-send'))
  expect(open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/18294220141?text='), '_blank', 'noopener,noreferrer')
  expect(publicBookingApi.sendBookingLink).toHaveBeenCalledTimes(1)
  open.mockRestore()
})

it('prefills the last service and specialist after identify', async () => {
  publicBookingApi.identify.mockResolvedValue({
    isNew: false,
    customerId: 'cust-1',
    documentType: 'cedula',
    documentId: '00112345678',
    displayName: 'Cliente prueba',
    email: 'client@example.com',
    phone: '8294220141',
    lastServiceId: 'service',
    lastEmployeeId: 'employee',
  })
  render(<MemoryRouter initialEntries={['/agendar?branch=branch&intent=book']}><AgendarPage /></MemoryRouter>)
  await screen.findByText('Elige tu sucursal')
  fireEvent.click(screen.getByTestId('branch-confirm'))
  await screen.findByText(/Ingresa tu documento/)
  fireEvent.change(screen.getByTestId('self-doc-lookup'), { target: { value: '00112345678' } })
  fireEvent.click(screen.getByTestId('self-login-search'))
  await screen.findByTestId('self-service')
  expect(screen.getByTestId('self-service').value).toBe('service')
  expect(screen.getByTestId('self-specialist').value).toBe('employee')
})

it('discards an old slot response after the date changes', async () => {
  let staleResponse
  publicBookingApi.listSlots
    .mockResolvedValueOnce({ slots: ['12:00'] })
    .mockResolvedValueOnce({ slots: ['12:00'] })
    .mockImplementationOnce(() => new Promise((resolve) => { staleResponse = resolve }))
    .mockResolvedValue({ slots: ['13:00'] })
  await selectAppointment()
  await waitFor(() => expect(publicBookingApi.listSlots).toHaveBeenCalledTimes(2))
  fireEvent.change(screen.getByTestId('self-booking-date'), { target: { value: '2027-02-15' } })
  fireEvent.change(screen.getByTestId('self-booking-date'), { target: { value: '2027-02-16' } })
  await waitFor(() => expect(publicBookingApi.listSlots).toHaveBeenCalledTimes(4))
  const timeSelect = await screen.findByTestId('self-booking-time-select')
  fireEvent.click(timeSelect)
  await screen.findByTestId('self-booking-time-slot-13:00')
  fireEvent.click(timeSelect)
  await act(async () => staleResponse({ slots: ['10:00'] }))
  fireEvent.click(timeSelect)
  await screen.findByTestId('self-booking-time-slot-13:00')
  expect(screen.queryByTestId('self-booking-time-slot-10:00')).toBeNull()
})

it('allows booking with cualquiera disponible without sending employeeId', async () => {
  publicBookingApi.listSlots.mockResolvedValue({ slots: ['10:00'] })
  publicBookingApi.book.mockResolvedValue({
    appointment: {
      id: 'appointment',
      managementToken: 'token',
      notification: { status: 'disabled' },
    },
  })
  render(<MemoryRouter initialEntries={['/agendar?branch=branch&intent=book']}><AgendarPage /></MemoryRouter>)
  await screen.findByText('Elige tu sucursal')
  fireEvent.click(screen.getByTestId('branch-confirm'))
  await screen.findByText(/Ingresa tu documento/)
  fireEvent.change(screen.getByTestId('self-doc-lookup'), { target: { value: '00112345678' } })
  fireEvent.click(screen.getByText('Regístrate aquí'))
  await screen.findByTestId('self-name')
  fireEvent.change(screen.getByTestId('self-name'), { target: { value: 'Cliente prueba' } })
  fireEvent.click(screen.getByTestId('pref-invite-invoice'))
  fireEvent.change(screen.getByTestId('self-email'), { target: { value: 'client@example.com' } })
  fireEvent.click(screen.getByTestId('self-save-profile'))
  await screen.findByTestId('self-service')
  fireEvent.change(screen.getByTestId('self-service'), { target: { value: 'service' } })
  expect(screen.getByTestId('self-specialist').value).toBe('')
  await waitFor(() => expect(publicBookingApi.listSlots).toHaveBeenCalled())
  fireEvent.click(screen.getByTestId('self-booking-time-select'))
  fireEvent.click(await screen.findByTestId('self-booking-time-slot-10:00'))
  fireEvent.click(screen.getByTestId('self-booking-continue'))
  expect(screen.getByText(/Pendiente de asignación por el equipo/)).toBeTruthy()
  fireEvent.click(screen.getByTestId('self-confirm'))
  await screen.findByText('¡Cita confirmada!')
  expect(publicBookingApi.book.mock.calls[0][1].employeeId).toBeUndefined()
  expect(screen.getByText(/pendientes de asignación/i)).toBeTruthy()
})

it('keeps one idempotency key when a reservation response is lost and prevents double clicks', async () => {
  publicBookingApi.listSlots.mockResolvedValue({ slots: ['10:00'] })
  publicBookingApi.book.mockRejectedValueOnce(new Error('Conexión interrumpida'))
    .mockResolvedValue({ appointment: { id: 'appointment', managementToken: 'token', notification: { status: 'failed' } } })
  await selectAppointment()
  await waitFor(() => expect(publicBookingApi.listSlots).toHaveBeenCalled())
  await screen.findByTestId('self-booking-time-select')
  fireEvent.click(screen.getByTestId('self-booking-time-select'))
  fireEvent.click(await screen.findByTestId('self-booking-time-slot-10:00'))
  fireEvent.click(screen.getByTestId('self-booking-continue'))
  fireEvent.click(screen.getByTestId('self-confirm'))
  fireEvent.click(screen.getByTestId('self-confirm'))
  await waitFor(() => expect(screen.getByTestId('self-confirm').disabled).toBe(false))
  expect(publicBookingApi.book).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByTestId('self-confirm'))
  await screen.findByText('¡Cita confirmada!')
  expect(publicBookingApi.book.mock.calls[0][2]).toBe(publicBookingApi.book.mock.calls[1][2])
  expect(screen.getByRole('link', { name: 'Ir a mi portal' }).getAttribute('href')).toContain('/agendar/portal')
  expect(screen.getByText(/no se pudo completar el correo/)).toBeTruthy()
})

it('hydrates profile from saved session when booking from the portal', async () => {
  rememberPublicSession({ branchId: 'branch', docType: 'cedula', documentId: '00112345678' })
  publicBookingApi.identify.mockResolvedValue({
    isNew: false,
    customerId: 'cust-portal',
    documentType: 'cedula',
    documentId: '00112345678',
    displayName: 'Cliente portal',
    email: 'portal@example.com',
    phone: '8095550000',
    lastServiceId: 'service',
    lastEmployeeId: 'employee',
  })
  publicBookingApi.listSlots.mockResolvedValue({ slots: ['10:00'] })
  publicBookingApi.book.mockResolvedValue({
    appointment: {
      id: 'appointment',
      managementToken: 'token',
      notification: { status: 'disabled' },
    },
  })
  render(<MemoryRouter initialEntries={['/agendar?branch=branch&intent=book']}><AgendarPage /></MemoryRouter>)
  await screen.findByTestId('self-service')
  await waitFor(() => expect(publicBookingApi.identify).toHaveBeenCalledWith(
    'branch',
    { documentType: 'cedula', documentId: '00112345678' },
  ))
  await waitFor(() => expect(screen.getByTestId('self-service').value).toBe('service'))
  await waitFor(() => expect(screen.getByTestId('self-specialist').value).toBe('employee'))
  await waitFor(() => expect(publicBookingApi.listSlots).toHaveBeenCalled())
  fireEvent.click(screen.getByTestId('self-booking-time-select'))
  fireEvent.click(await screen.findByTestId('self-booking-time-slot-10:00'))
  fireEvent.click(screen.getByTestId('self-booking-continue'))
  expect(screen.getByText('Cliente portal')).toBeTruthy()
  expect(screen.getByText(/001-1234567-8|00112345678/)).toBeTruthy()
  fireEvent.click(screen.getByTestId('self-confirm'))
  await screen.findByText('¡Cita confirmada!')
  expect(publicBookingApi.book.mock.calls[0][1].documentId).toBe('00112345678')
  expect(publicBookingApi.book.mock.calls[0][1].displayName).toBe('Cliente portal')
})

it('opens a management link without a document or administrator session', async () => {
  publicBookingApi.getAppointment.mockResolvedValue({ id: 'appointment', date: '2027-02-15', time: '10:00', durationMinutes: 45, serviceName: 'Facial', status: 'cancelled' })
  render(<MemoryRouter initialEntries={['/agendar/perfil?branch=branch&appointment=appointment&token=token']}><PerfilPublicoPage /></MemoryRouter>)
  await screen.findByText('Cancelada')
  expect(publicBookingApi.getAppointment).toHaveBeenCalledWith('branch', 'appointment', 'token')
  expect(publicBookingApi.identify).not.toHaveBeenCalled()
})
