/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const BRANCH_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector) => selector({
    status: 'online',
    hasPermission: () => true,
  }),
}))

vi.mock('@/hooks/useActiveBranchScope', () => ({
  useActiveBranchScope: () => ({
    activeBranchId: BRANCH_ID,
    setActiveBranch: vi.fn(),
    selectOptions: [],
  }),
}))

vi.mock('@/services/chatApi', () => ({
  chatApi: {
    listConversations: vi.fn(async () => ({ items: [] })),
    listMessages: vi.fn(async () => ({ items: [], totalPages: 1 })),
  },
}))

vi.mock('@/modules/chat/components/ChatConversationList', () => ({
  ChatConversationList: () => <div data-testid="chat-list" />,
}))

vi.mock('@/modules/chat/components/ChatThreadPanel', () => ({
  ChatThreadPanel: () => <div data-testid="chat-thread" />,
}))

import { chatApi } from '@/services/chatApi'
import ChatPage, { POLL_MS } from '@/modules/chat/pages/ChatPage'

describe('ChatPage polling', () => {
  beforeEach(() => {
    chatApi.listConversations.mockClear()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('no polléa con la pestaña oculta y pega un tick al volver visible', async () => {
    vi.useFakeTimers()
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )
    await act(async () => {})
    expect(chatApi.listConversations).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS) })
    expect(chatApi.listConversations).toHaveBeenCalledTimes(2)

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3) })
    expect(chatApi.listConversations).toHaveBeenCalledTimes(2)

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(chatApi.listConversations).toHaveBeenCalledTimes(3)
  })
})
