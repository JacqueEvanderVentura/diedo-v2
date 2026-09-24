import { describe, expect, it, vi } from 'vitest'
import {
  isOauthReturnMessage,
  navigateOauthPopup,
  notifyOpenerAndClose,
  oauthPopupFeatures,
  openOauthPopupPlaceholder,
  readOauthReturn,
} from '@/modules/chat/lib/oauthPopup'

describe('oauthPopup', () => {
  it('opens a named blank window before Meta returns the authorize URL', () => {
    const popup = { closed: false, location: { replace: vi.fn() }, focus: vi.fn() }
    const open = vi.fn(() => popup)
    vi.stubGlobal('window', { open })
    expect(openOauthPopupPlaceholder('instagram')).toBe(popup)
    expect(open).toHaveBeenCalledWith(
      'about:blank',
      'helios-meta-oauth-instagram',
      oauthPopupFeatures(),
    )
    expect(navigateOauthPopup(popup, 'https://www.instagram.com/oauth/authorize')).toBe(true)
    expect(popup.location.replace).toHaveBeenCalledWith(
      'https://www.instagram.com/oauth/authorize',
    )
    vi.unstubAllGlobals()
  })

  it('does not navigate the Helios tab when the popup is blocked', () => {
    expect(navigateOauthPopup(null, 'https://www.facebook.com/dialog/oauth')).toBe(false)
    expect(navigateOauthPopup({ closed: true }, 'https://www.facebook.com/dialog/oauth')).toBe(
      false,
    )
  })

  it('posts the OAuth result to the opener and closes the popup', () => {
    const opener = { closed: false, postMessage: vi.fn() }
    const close = vi.fn()
    vi.stubGlobal('window', {
      opener,
      close,
      location: { origin: 'https://app.helios360erp.com' },
    })
    const payload = { type: 'helios-meta-oauth', oauth: 'select', stateId: 'abc' }
    expect(notifyOpenerAndClose(payload, 'https://app.helios360erp.com')).toBe(true)
    expect(opener.postMessage).toHaveBeenCalledWith(payload, 'https://app.helios360erp.com')
    expect(close).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('reads chatOauth query params and ignores unrelated postMessage events', () => {
    const params = new URLSearchParams('chatOauth=select&chatOauthState=abc&chatChannel=whatsapp')
    expect(readOauthReturn(params)).toMatchObject({
      oauth: 'select',
      stateId: 'abc',
      channel: 'whatsapp',
    })
    expect(
      isOauthReturnMessage(
        { origin: 'https://evil.example', data: { type: 'helios-meta-oauth', oauth: 'select' } },
        'https://app.helios360erp.com',
      ),
    ).toBe(false)
  })
})
