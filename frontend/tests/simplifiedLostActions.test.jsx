// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SimplifiedLeadActions } from '@/modules/crm/components/SimplifiedLeadActions'
import { useCrmStore } from '@/stores/crmStore'
import { useSessionStore } from '@/stores/sessionStore'

describe('ficha de oportunidad perdida en CRM Simplificado', () => {
  const originalUpdateOpportunity = useCrmStore.getState().updateOpportunity
  afterEach(() => {
    cleanup()
    useCrmStore.setState({ updateOpportunity: originalUpdateOpportunity })
  })

  const lostOpportunity = () => ({
    id: 'lost-1', branchId: 'branch-1', leadId: null, customerId: null,
    customerName: 'Cliente de prueba', title: 'Consulta', stage: 'perdido',
    lostReason: 'Precio alto', closedAt: '2026-09-21T16:00:00Z',
  })

  it('muestra el motivo y permite iniciar la reapertura', () => {
    const opportunity = lostOpportunity()
    useSessionStore.setState({ status: 'demo', user: { branchIds: ['branch-1'] } })
    useCrmStore.setState({ opportunities: [opportunity], quotes: [] })
    render(<SimplifiedLeadActions opportunity={opportunity} lead={null} />)
    expect(screen.getByText('Precio alto')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reabrir/i })).toBeTruthy()
  })

  it('mantiene la ficha en consulta para quien no tiene crm.manage', () => {
    const opportunity = lostOpportunity()
    useSessionStore.setState({
      status: 'online',
      user: { branchIds: ['branch-1'], effectivePermissionCodes: ['crm.read'] },
    })
    useCrmStore.setState({ opportunities: [opportunity], quotes: [] })
    render(<SimplifiedLeadActions opportunity={opportunity} lead={null} />)
    expect(screen.getByText('Precio alto')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Reabrir/i })).toBeNull()
  })

  it('reabre en Interesados por defecto y notifica el cambio de etapa', async () => {
    const opportunity = lostOpportunity()
    const updateOpportunity = vi.fn().mockResolvedValue({ ...opportunity, stage: 'propuesta' })
    const onActionComplete = vi.fn()
    useSessionStore.setState({ status: 'demo', user: { branchIds: ['branch-1'] } })
    useCrmStore.setState({ opportunities: [opportunity], quotes: [], updateOpportunity })
    render(<SimplifiedLeadActions
      opportunity={opportunity} lead={null} onActionComplete={onActionComplete}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir oportunidad' }))
    expect(screen.getByTestId('crm-simplified-reopen-stage').textContent).toContain('Interesados')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reapertura' }))
    await waitFor(() => {
      expect(updateOpportunity).toHaveBeenCalledWith('lost-1', { stage: 'propuesta' })
      expect(onActionComplete).toHaveBeenCalledWith('propuesta')
    })
  })

  it('preselecciona Interesados cada vez que se abre el formulario', () => {
    const opportunity = lostOpportunity()
    useSessionStore.setState({ status: 'demo', user: { branchIds: ['branch-1'] } })
    useCrmStore.setState({ opportunities: [opportunity], quotes: [] })
    render(<SimplifiedLeadActions opportunity={opportunity} lead={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir oportunidad' }))
    fireEvent.click(screen.getByTestId('crm-simplified-reopen-stage'))
    fireEvent.click(screen.getByRole('button', { name: 'Seguimiento' }))
    expect(screen.getByTestId('crm-simplified-reopen-stage').textContent).toContain('Seguimiento')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir oportunidad' }))
    expect(screen.getByTestId('crm-simplified-reopen-stage').textContent).toContain('Interesados')
  })

  it('mantiene el formulario abierto si falla la API', async () => {
    const opportunity = lostOpportunity()
    const updateOpportunity = vi.fn().mockRejectedValue(new Error('API no disponible'))
    const onActionComplete = vi.fn()
    useSessionStore.setState({ status: 'demo', user: { branchIds: ['branch-1'] } })
    useCrmStore.setState({ opportunities: [opportunity], quotes: [], updateOpportunity })
    render(<SimplifiedLeadActions
      opportunity={opportunity} lead={null} onActionComplete={onActionComplete}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir oportunidad' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reapertura' }))
    await waitFor(() => expect(updateOpportunity).toHaveBeenCalledTimes(1))
    expect(onActionComplete).not.toHaveBeenCalled()
    expect(screen.getByTestId('crm-simplified-reopen-modal')).toBeTruthy()
  })
})
