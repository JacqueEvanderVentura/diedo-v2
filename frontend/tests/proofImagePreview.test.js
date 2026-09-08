// @vitest-environment jsdom

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProofImagePreview, isImageProof } from '@/modules/pos/components/ProofImagePreview'

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastMocks.success,
    error: toastMocks.error,
    info: vi.fn(),
  },
}))

vi.mock('framer-motion', () => {
  const Passthrough = ({ children, ...props }) => React.createElement('div', props, children)
  return {
    AnimatePresence: ({ children }) => children,
    motion: {
      div: Passthrough,
    },
  }
})

describe('isImageProof', () => {
  it('detecta imágenes por contentType y por extensión', () => {
    expect(isImageProof({ contentType: 'image/png' }, null)).toBe(true)
    expect(isImageProof({ name: 'CnP_08092026_120451.png' }, new Blob(['x']))).toBe(true)
    expect(isImageProof({ name: 'recibo.pdf' }, new Blob(['x'], { type: 'application/pdf' }))).toBe(false)
  })
})

describe('ProofImagePreview', () => {
  beforeEach(() => {
    toastMocks.success.mockReset()
    toastMocks.error.mockReset()
    URL.createObjectURL = vi.fn(() => 'blob:proof-preview')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('muestra preview con object-contain, ampliar, copiar y descargar', async () => {
    const blob = new Blob(['fake-image'], { type: 'image/png' })
    const loadProof = vi.fn().mockResolvedValue(blob)
    const onDownload = vi.fn().mockResolvedValue(undefined)
    const write = vi.fn().mockResolvedValue(undefined)

    class FakeClipboardItem {
      constructor(items) {
        this.items = items
      }
    }
    globalThis.ClipboardItem = FakeClipboardItem
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    })

    render(
      React.createElement(ProofImagePreview, {
        proof: { name: 'CnP_08092026_120451.png', contentType: 'image/png' },
        loadProof,
        onDownload,
      })
    )

    expect(screen.getByTestId('proof-preview-loading')).toBeTruthy()

    await waitFor(() => expect(screen.getByTestId('proof-image-preview')).toBeTruthy())
    expect(loadProof).toHaveBeenCalledTimes(1)

    const previewImg = screen.getByAltText('CnP_08092026_120451.png')
    expect(previewImg.getAttribute('src')).toBe('blob:proof-preview')
    expect(previewImg.className).toContain('object-contain')

    fireEvent.click(screen.getByTestId('proof-preview-enlarge'))
    expect(screen.getByTestId('proof-lightbox-image')).toBeTruthy()
    fireEvent.click(screen.getByTestId('proof-lightbox-close'))
    await waitFor(() => expect(screen.queryByTestId('proof-lightbox-image')).toBeNull())

    fireEvent.click(screen.getByTestId('proof-preview-copy'))
    await waitFor(() => expect(write).toHaveBeenCalled())
    expect(toastMocks.success).toHaveBeenCalledWith('Imagen copiada al portapapeles')

    fireEvent.click(screen.getByTestId('proof-preview-download'))
    await waitFor(() => expect(onDownload).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'CnP_08092026_120451.png' })
    ))
  })

  it('para archivos no imagen conserva la fila de descarga', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' })
    const loadProof = vi.fn().mockResolvedValue(blob)
    const onDownload = vi.fn().mockResolvedValue(undefined)

    render(
      React.createElement(ProofImagePreview, {
        proof: { name: 'comprobante.pdf', contentType: 'application/pdf' },
        loadProof,
        onDownload,
      })
    )

    await waitFor(() => expect(screen.getByText(/Archivo adjunto \(sin vista previa\):/)).toBeTruthy())
    expect(screen.queryByTestId('proof-image-preview')).toBeNull()
    expect(screen.getByTestId('proof-preview-file')).toBeTruthy()

    fireEvent.click(screen.getByTitle('Descargar comprobante'))
    await waitFor(() => expect(onDownload).toHaveBeenCalled())
  })

  it('muestra error recuperable si la carga falla', async () => {
    const loadProof = vi.fn().mockRejectedValue(new Error('red caída'))
    const onDownload = vi.fn().mockResolvedValue(undefined)

    render(
      React.createElement(ProofImagePreview, {
        proof: { name: 'falla.png' },
        loadProof,
        onDownload,
      })
    )

    await waitFor(() => expect(screen.getByTestId('proof-preview-error')).toBeTruthy())
    expect(screen.getByText('red caída')).toBeTruthy()
    fireEvent.click(screen.getByText(/Descargar/))
    await waitFor(() => expect(onDownload).toHaveBeenCalled())
  })
})
