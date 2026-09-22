import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({ apiClient: mocks }))

import { chatApi } from '@/services/chatApi'

describe('chatApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists conversations with branch and channel filters', async () => {
    mocks.get.mockResolvedValue({ items: [] })
    await chatApi.listConversations({
      branchId: 'branch-1',
      channel: 'whatsapp',
      search: 'hola',
      page: 1,
      pageSize: 50,
    })
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/chat/conversations', {
      branchId: 'branch-1',
      channel: 'whatsapp',
      search: 'hola',
      page: 1,
      pageSize: 50,
    })
  })

  it('loads messages and sends text', async () => {
    mocks.get.mockResolvedValue({ items: [], totalPages: 1 })
    mocks.post.mockResolvedValue({ id: 'msg-1' })

    await chatApi.listMessages('conv-1', { page: 1, pageSize: 50 })
    await chatApi.sendMessage('conv-1', 'Hola')

    expect(mocks.get).toHaveBeenCalledWith('/api/v1/chat/conversations/conv-1/messages', {
      page: 1,
      pageSize: 50,
    })
    expect(mocks.post).toHaveBeenCalledWith('/api/v1/chat/conversations/conv-1/messages', {
      body: 'Hola',
    })
  })
})
