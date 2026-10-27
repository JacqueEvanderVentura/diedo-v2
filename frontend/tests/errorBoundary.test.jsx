/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Boom({ fail }) {
  if (fail) throw new Error('boom')
  return <div data-testid="boundary-ok">ok</div>
}

it('muestra fallback y permite reintentar sin tumbar el árbol', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { rerender } = render(
    <ErrorBoundary resetKey="a">
      <Boom fail />
    </ErrorBoundary>
  )
  expect(screen.getByTestId('error-boundary')).toBeTruthy()
  expect(screen.queryByTestId('boundary-ok')).toBeNull()

  rerender(
    <ErrorBoundary resetKey="b">
      <Boom fail={false} />
    </ErrorBoundary>
  )
  expect(screen.getByTestId('boundary-ok')).toBeTruthy()
})

it('reintenta desde el botón', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let fail = true
  function ToggleBoom() {
    if (fail) throw new Error('boom')
    return <div data-testid="boundary-ok">ok</div>
  }
  render(
    <ErrorBoundary>
      <ToggleBoom />
    </ErrorBoundary>
  )
  fail = false
  fireEvent.click(screen.getByTestId('error-boundary-retry'))
  expect(screen.getByTestId('boundary-ok')).toBeTruthy()
})
