// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ConfiguracionPage from '@/modules/configuracion/pages/ConfiguracionPage'

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
    expect(screen.getByText('Cuenta')).toBeTruthy()
    expect(screen.getByTestId('config-hub-perfil')).toBeTruthy()
    expect(screen.queryByTestId('config-hub-notificaciones')).toBeNull()

    fireEvent.change(screen.getByTestId('config-hub-search'), { target: { value: 'nombre del n' } })
    expect(screen.getByText('Cuenta')).toBeTruthy()
    expect(screen.getByTestId('config-hub-perfil')).toBeTruthy()
    expect(screen.getAllByText('Nombre del negocio').length).toBeGreaterThan(0)
    expect(screen.queryByText(/^Rol:/)).toBeNull()
  })
})
