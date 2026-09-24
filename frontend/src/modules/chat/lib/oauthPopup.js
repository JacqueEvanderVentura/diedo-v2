export function oauthPopupFeatures() {
  return 'popup=yes,width=620,height=780,scrollbars=yes'
}

export const OAUTH_MESSAGE_TYPE = 'helios-meta-oauth'

export function openOauthPopupPlaceholder(channel) {
  const name = `helios-meta-oauth-${channel || 'meta'}`
  return window.open('about:blank', name, oauthPopupFeatures())
}

export function navigateOauthPopup(popup, authorizationUrl) {
  if (!authorizationUrl) return false
  if (popup && !popup.closed) {
    popup.location.replace(authorizationUrl)
    popup.focus()
    return true
  }
  return false
}

export function readOauthReturn(searchParams) {
  const oauth = searchParams?.get?.('chatOauth')
  if (!oauth) return null
  return {
    type: OAUTH_MESSAGE_TYPE,
    oauth,
    message: searchParams.get('chatOauthMessage') || '',
    detail: searchParams.get('chatOauthDetail') || '',
    stateId: searchParams.get('chatOauthState') || '',
    channel: searchParams.get('chatChannel') || '',
  }
}

export function isOauthReturnMessage(event, origin = window.location.origin) {
  return event?.origin === origin && event?.data?.type === OAUTH_MESSAGE_TYPE && event.data.oauth
}

export function notifyOpenerAndClose(payload, origin = window.location.origin) {
  if (!payload?.oauth) return false
  if (typeof window === 'undefined' || !window.opener || window.opener.closed) return false
  window.opener.postMessage(payload, origin)
  window.close()
  return true
}
