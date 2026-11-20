/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal, modalLayerRank } from '@/components/ui/Modal'

afterEach(() => {
  cleanup()
})

describe('Modal stacking', () => {
  it('asigna z-index nested por encima de elevated', () => {
    expect(modalLayerRank({ elevated: true })).toBe(100)
    expect(modalLayerRank({ nested: true })).toBe(120)
    expect(modalLayerRank({ nested: true, elevated: true })).toBe(120)
  })

  it('pinta el hijo nested encima del padre elevated', () => {
    render(
      <>
        <Modal open onClose={() => {}} title="Padre" testId="parent-modal" elevated>
          padre
        </Modal>
        <Modal open onClose={() => {}} title="Hijo" testId="child-modal" nested>
          hijo
        </Modal>
      </>,
    )

    const parent = screen.getByTestId('parent-modal').closest('[data-modal-layer]')
    const child = screen.getByTestId('child-modal').closest('[data-modal-layer]')
    expect(parent?.getAttribute('data-modal-layer')).toBe('elevated')
    expect(child?.getAttribute('data-modal-layer')).toBe('nested')
    expect(parent?.className).toContain('z-[100]')
    expect(child?.className).toContain('z-[120]')
  })

  it('Escape cierra solo el modal tope', () => {
    const onParentClose = vi.fn()
    const onChildClose = vi.fn()
    render(
      <>
        <Modal open onClose={onParentClose} title="Padre" testId="parent-modal" elevated>
          padre
        </Modal>
        <Modal open onClose={onChildClose} title="Hijo" testId="child-modal" nested>
          hijo
        </Modal>
      </>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onChildClose).toHaveBeenCalledTimes(1)
    expect(onParentClose).not.toHaveBeenCalled()
  })
})
