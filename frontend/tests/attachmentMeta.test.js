import { describe, expect, it } from 'vitest'
import { attachmentTypeLabel, formatAttachmentSizeFromItem } from '@/lib/attachmentMeta'

describe('attachmentMeta', () => {
  it('muestra tipo y tamaño legibles', () => {
    expect(attachmentTypeLabel({ name: 'doc.pdf', contentType: 'application/pdf' })).toBe('PDF')
    expect(formatAttachmentSizeFromItem({ sizeBytes: 2048 })).toBe('2.0 KB')
  })
})
