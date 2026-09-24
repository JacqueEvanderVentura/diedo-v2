import { describe, expect, it } from 'vitest'
import {
  conversationSubtitle,
  conversationTitle,
  formatInstagramHandle,
} from '@/modules/chat/lib/format'

describe('chat conversation labels', () => {
  it('prefers the full name and shows the Instagram handle underneath', () => {
    const conversation = {
      participantDisplayName: 'Evander Ventura',
      participantUsername: 'evander.codes',
      participantProviderId: '936647652419318',
    }
    expect(conversationTitle(conversation)).toBe('Evander Ventura')
    expect(conversationSubtitle(conversation)).toBe('@evander.codes')
  })

  it('falls back to the username when Meta does not send a name', () => {
    const conversation = {
      participantDisplayName: '',
      participantUsername: '@somnus_systems',
      participantProviderId: '17841410296549561',
    }
    expect(conversationTitle(conversation)).toBe('somnus_systems')
    expect(formatInstagramHandle(conversation.participantUsername)).toBe('@somnus_systems')
  })
})
