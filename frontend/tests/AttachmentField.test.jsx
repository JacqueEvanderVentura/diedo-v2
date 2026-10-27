// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AttachmentField } from '@/components/ui/AttachmentField'

vi.mock('@/lib/imageAttachments', () => ({
  filesToAttachments: async (files) => Array.from(files || []).map((file, index) => ({
    id: `local-${index}`,
    name: file.name,
    contentType: file.type || 'application/pdf',
    pendingFile: file,
  })),
}))

afterEach(cleanup)

describe('AttachmentField', () => {
  it('reemplaza el archivo único cuando maxFiles es 1', async () => {
    const onChange = vi.fn()
    render(
      <AttachmentField
        value={[{ id: 'old', name: 'viejo.pdf', contentType: 'application/pdf' }]}
        onChange={onChange}
        multiple={false}
        maxFiles={1}
        label="Contrato"
        testId="employee-contract-attachment"
      />
    )

    expect(screen.getByText('Reemplazar')).toBeTruthy()
    const input = document.getElementById('employee-contract-attachment-input')
    fireEvent.change(input, {
      target: { files: [new File(['contrato'], 'nuevo.pdf', { type: 'application/pdf' })] },
    })

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const next = onChange.mock.calls[0][0]
    expect(next).toHaveLength(1)
    expect(next[0].name).toBe('nuevo.pdf')
    expect(next[0].id).not.toBe('old')
  })
})
