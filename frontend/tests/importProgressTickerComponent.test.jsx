// @vitest-environment jsdom

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ImportProgressTicker } from '@/modules/configuracion/components/ImportProgressTicker'

vi.mock('framer-motion', () => {
  const Passthrough = ({ children, ...props }) => React.createElement('div', props, children)
  return {
    AnimatePresence: ({ children }) => children,
    motion: {
      div: Passthrough,
    },
  }
})

describe('ImportProgressTicker', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows at most three imported rows from real sample data', () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `row-${index}`,
      displayName: `Cliente ${index}`,
      phone: '8095550101',
      date: '2026-11-15',
      time: '10:00',
      serviceName: 'Facial',
    }))

    render(<ImportProgressTicker rows={rows} animating={false} />)

    expect(screen.getByTestId('data-import-ticker')).toBeTruthy()
    expect(screen.getByText('Cliente 0')).toBeTruthy()
    expect(screen.getByText('Cliente 1')).toBeTruthy()
    expect(screen.getByText('Cliente 2')).toBeTruthy()
    expect(screen.queryByText('Cliente 3')).toBeNull()
  })
})
