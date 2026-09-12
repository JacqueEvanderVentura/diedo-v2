import { describe, expect, it, vi } from 'vitest'
import { demoSvgImage, filesToAttachments } from '@/lib/imageAttachments'

describe('imageAttachments helpers', () => {
  it('genera data URLs SVG distintas por color', () => {
    const red = demoSvgImage('#dc2626', 'EQP-010')
    const blue = demoSvgImage('#2563eb', 'EQP-009')
    expect(red).toContain('data:image/svg+xml')
    expect(blue).toContain('data:image/svg+xml')
    expect(red).not.toBe(blue)
  })

  it('convierte archivos en adjuntos con preview', async () => {
    class MockFileReader {
      readAsDataURL() {
        this.result = 'data:image/png;base64,ZGVtbw=='
        this.onload?.({ target: this })
      }
    }
    vi.stubGlobal('FileReader', MockFileReader)

    const file = new File(['demo'], 'factura.png', { type: 'image/png' })
    const attachments = await filesToAttachments([file])
    expect(attachments).toHaveLength(1)
    expect(attachments[0].name).toBe('factura.png')
    expect(attachments[0].previewObjectUrl).toMatch(/^data:image\/png/)
    expect(attachments[0].pendingFile).toBe(file)
  })
})
