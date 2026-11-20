import { describe, expect, it, vi } from 'vitest'
import {
  loadPortalDashboard,
  portalLoadErrorMessage,
} from '@/modules/portal/lib/loadPortalDashboard'

const session = { docType: 'cedula', documentId: '00112345678' }

function apis({ me, appointments, invoices, receivables, tasks, context } = {}) {
  return {
    bookingApi: {
      getContext: vi.fn().mockImplementation(
        context === undefined
          ? () => Promise.resolve({ branch: { branchName: 'Norte' } })
          : context,
      ),
    },
    portalApi: {
      me: vi.fn().mockImplementation(me || (() => Promise.resolve({ displayName: 'Ana' }))),
      listAppointments: vi.fn().mockImplementation(
        appointments || (() => Promise.resolve({ items: [{ id: 'apt-1' }] })),
      ),
      listInvoices: vi.fn().mockImplementation(
        invoices || (() => Promise.resolve({ items: [{ id: 'inv-1' }] })),
      ),
      listReceivables: vi.fn().mockImplementation(
        receivables || (() => Promise.resolve({ items: [] })),
      ),
      listTasks: vi.fn().mockImplementation(
        tasks || (() => Promise.resolve({ items: [] })),
      ),
    },
  }
}

describe('loadPortalDashboard', () => {
  it('keeps citas and facturas when the profile request fails', async () => {
    const { bookingApi, portalApi } = apis({
      me: () => Promise.reject(new Error('500')),
    })
    const dashboard = await loadPortalDashboard({
      branchId: 'branch',
      session,
      bookingApi,
      portalApi,
    })
    expect(dashboard.profile).toBeNull()
    expect(dashboard.appointments).toEqual([{ id: 'apt-1' }])
    expect(dashboard.invoices).toEqual([{ id: 'inv-1' }])
    expect(dashboard.failures).toEqual(['profile'])
    expect(portalLoadErrorMessage(dashboard.failures)).toBe('No se pudo cargar: perfil.')
  })

  it('does not blank the rest of the portal when tasks fail', async () => {
    const { bookingApi, portalApi } = apis({
      tasks: () => Promise.reject(new Error('503')),
    })
    const dashboard = await loadPortalDashboard({
      branchId: 'branch',
      session,
      bookingApi,
      portalApi,
    })
    expect(dashboard.appointments).toHaveLength(1)
    expect(dashboard.invoices).toHaveLength(1)
    expect(dashboard.portalTasks).toEqual([])
    expect(dashboard.failures).toEqual(['tasks'])
  })

  it('uses the generic portal error when almost everything fails', () => {
    expect(
      portalLoadErrorMessage(['profile', 'appointments', 'invoices', 'receivables']),
    ).toBe('No se pudo cargar tu portal. Intenta iniciar sesión de nuevo.')
  })
})
