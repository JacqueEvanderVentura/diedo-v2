// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import { chatChannelsCopy, chatInboxCopy, isAppReviewEnglish } from '@/modules/chat/lib/appReviewLocale'

describe('appReviewLocale', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('enables English mode from lang=en query', () => {
    const params = new URLSearchParams('lang=en')
    expect(isAppReviewEnglish(params)).toBe(true)
    expect(chatChannelsCopy(true).connect).toBe('Connect')
    expect(chatInboxCopy(true).refresh).toBe('Refresh')
  })

  it('persists English mode in sessionStorage', () => {
    window.sessionStorage.setItem('helios_app_review_lang', 'en')
    const params = new URLSearchParams()
    expect(isAppReviewEnglish(params)).toBe(true)
  })
})