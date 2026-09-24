// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ConfiguracionPage from '@/modules/configuracion/pages/ConfiguracionPage'

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe('ConfiguracionPage search', () => {
  it('filtra jerarquía Cuenta / Perfil / Nombre del negocio', () => {
    render(
      <MemoryRouter>
        <ConfiguracionPage />
      </MemoryRouter>
    )

    expect(screen.getByTestId('config-hub-perfil')).toBeTruthy()
    expect(screen.getByTestId('config-hub-usuarios')).toBeTruthy()

    fireEvent.change(screen.getByTestId('config-hub-search'), { target: { value: 'cuenta' } })
    expect(screen.getByTestId('config-hub-perfil')).toBeTruthy()
    expect(screen.getByTestId('config-hub-notificaciones')).toBeTruthy()
    expect(screen.queryByTestId('config-hub-usuarios')).toBeNull()

    fireEvent.change(screen.getByTestId('config-hub-search'), { target: { value: 'perfil' } })
    expect(screen.getAllByText('Cuenta').length).toBeGreaterThan(0)
    expect(screen.getByTestId('config-hub-perfil')).toBeTruthy()
    expect(screen.queryByTestId('config-hub-notificaciones')).toBeNull()

    fireEvent.change(screen.getByTestId('config-hub-search'), { target: { value: 'nombre del n' } })
    expect(screen.getAllByText('Cuenta').length).toBeGreaterThan(0)
    expect(screen.getByTestId('config-hub-perfil')).toBeTruthy()
    expect(screen.getAllByText('Nombre del negocio').length).toBeGreaterThan(0)
    expect(screen.queryByText(/^Rol:/)).toBeNull()
  })

  it('hace scroll suave hasta el módulo de ?open=', async () => {
    render(
      <MemoryRouter initialEntries={['/configuracion?open=chat-canales']}>
        <ConfiguracionPage />
      </MemoryRouter>
    )

    expect(screen.getByTestId('config-hub-chat-canales').getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => {
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })
    })
  })
})
