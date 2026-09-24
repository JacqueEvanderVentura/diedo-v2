import { describe, expect, it, vi } from 'vitest'
import {
  navigateOauthPopup,
  oauthPopupFeatures,
  openOauthPopupPlaceholder,
} from '@/modules/chat/lib/oauthPopup'

describe('oauthPopup', () => {
  it('opens a named blank window before Meta returns the authorize URL', () => {
    const popup = { closed: false, location: { replace: vi.fn() }, focus: vi.fn() }
    const open = vi.fn(() => popup)
    vi.stubGlobal('window', { open })
    expect(openOauthPopupPlaceholder('whatsapp')).toBe(popup)
    expect(open).toHaveBeenCalledWith(
      'about:blank',
      'helios-meta-oauth-whatsapp',
      oauthPopupFeatures(),
    )
    expect(navigateOauthPopup(popup, 'https://www.facebook.com/dialog/oauth')).toBe(true)
    expect(popup.location.replace).toHaveBeenCalledWith('https://www.facebook.com/dialog/oauth')
    vi.unstubAllGlobals()
  })

  it('does not navigate the Helios tab when the popup is blocked', () => {
    expect(navigateOauthPopup(null, 'https://www.facebook.com/dialog/oauth')).toBe(false)
    expect(navigateOauthPopup({ closed: true }, 'https://www.facebook.com/dialog/oauth')).toBe(false)
  })
})
