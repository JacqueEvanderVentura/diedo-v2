// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SimplifiedCrmSectionNav } from '@/modules/crm/components/SimplifiedCrmSectionNav'

describe('SimplifiedCrmSectionNav', () => {
  afterEach(() => {
    cleanup()
  })

  it('muestra tres pills con enlaces a prospectos, clientes y ventas', () => {
    render(
      <MemoryRouter initialEntries={['/crm/workspace']}>
        <SimplifiedCrmSectionNav />
      </MemoryRouter>
    )
    const nav = screen.getByTestId('crm-simplified-sections')
    expect(within(nav).getByRole('link', { name: 'Prospectos' }).getAttribute('href')).toBe('/crm/workspace')
    expect(within(nav).getByRole('link', { name: 'Clientes' }).getAttribute('href')).toBe(
      '/crm/workspace?section=clientes'
    )
    expect(screen.getByTestId('crm-simplified-section-ventas').getAttribute('href')).toBe('/crm/ventas')
  })

  it('resalta ventas cuando la ruta es /crm/ventas', () => {
    render(
      <MemoryRouter initialEntries={['/crm/ventas']}>
        <SimplifiedCrmSectionNav />
      </MemoryRouter>
    )
    const ventas = screen.getByTestId('crm-simplified-section-ventas')
    expect(ventas.className).toMatch(/bg-blue-600/)
  })
})
