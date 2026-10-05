// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SimplifiedLeadActions } from '@/modules/crm/components/SimplifiedLeadActions'
import { useCrmStore } from '@/stores/crmStore'
import { useSessionStore } from '@/stores/sessionStore'

describe('ficha de lead perdido en CRM Simplificado', () => {
  const originalUpdateLead = useCrmStore.getState().updateLead
  afterEach(() => {
    cleanup()
    useCrmStore.setState({ updateLead: originalUpdateLead })
  })

  const lostLead = () => ({
    id: 'lost-1',
    branchId: 'branch-1',
    customerId: null,
    company: 'Cliente de prueba',
    name: 'Consulta',
    status: 'perdido',
    lostReason: 'Precio alto',
    updatedAt: '2026-09-21T16:00:00Z',
  })

  it('muestra el motivo y permite iniciar la reapertura', () => {
    const lead = lostLead()
    useSessionStore.setState({ status: 'demo', user: { branchIds: ['branch-1'] } })
    useCrmStore.setState({ leads: [lead], quotes: [] })
    render(<SimplifiedLeadActions lead={lead} />)
    expect(screen.getByText('Precio alto')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reabrir/i })).toBeTruthy()
  })

  it('mantiene la ficha en consulta para quien no tiene crm.manage', () => {
    const lead = lostLead()
    useSessionStore.setState({
      status: 'online',
      user: { branchIds: ['branch-1'], effectivePermissionCodes: ['crm.read'] },
    })
    useCrmStore.setState({ leads: [lead], quotes: [] })
    render(<SimplifiedLeadActions lead={lead} />)
    expect(screen.getByText('Precio alto')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Reabrir/i })).toBeNull()
  })

  it('reabre en Interesados por defecto y notifica el cambio de etapa', async () => {
    const lead = lostLead()
    const updateLead = vi.fn().mockResolvedValue({ ...lead, status: 'propuesta' })
    const onActionComplete = vi.fn()
    useSessionStore.setState({ status: 'demo', user: { branchIds: ['branch-1'] } })
    useCrmStore.setState({ leads: [lead], quotes: [], updateLead })
    render(<SimplifiedLeadActions lead={lead} onActionComplete={onActionComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir oportunidad' }))
    expect(screen.getByTestId('crm-simplified-reopen-stage').textContent).toContain('Interesados')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reapertura' }))
    await waitFor(() => {
      expect(updateLead).toHaveBeenCalledWith('lost-1', { status: 'propuesta' })
      expect(onActionComplete).toHaveBeenCalledWith('propuesta')
    })
  })

  it('preselecciona Interesados cada vez que se abre el formulario', () => {
    const lead = lostLead()
    useSessionStore.setState({ status: 'demo', user: { branchIds: ['branch-1'] } })
    useCrmStore.setState({ leads: [lead], quotes: [] })
    render(<SimplifiedLeadActions lead={lead} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir oportunidad' }))
    fireEvent.click(screen.getByTestId('crm-simplified-reopen-stage'))
    fireEvent.click(screen.getByRole('button', { name: 'Seguimiento' }))
    expect(screen.getByTestId('crm-simplified-reopen-stage').textContent).toContain('Seguimiento')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir oportunidad' }))
    expect(screen.getByTestId('crm-simplified-reopen-stage').textContent).toContain('Interesados')
  })

  it('mantiene el formulario abierto si falla la API', async () => {
    const lead = lostLead()
    const updateLead = vi.fn().mockRejectedValue(new Error('API no disponible'))
    const onActionComplete = vi.fn()
    useSessionStore.setState({ status: 'demo', user: { branchIds: ['branch-1'] } })
    useCrmStore.setState({ leads: [lead], quotes: [], updateLead })
    render(<SimplifiedLeadActions lead={lead} onActionComplete={onActionComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir oportunidad' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reapertura' }))
    await waitFor(() => expect(updateLead).toHaveBeenCalledTimes(1))
    expect(onActionComplete).not.toHaveBeenCalled()
    expect(screen.getByTestId('crm-simplified-reopen-modal')).toBeTruthy()
  })
})
