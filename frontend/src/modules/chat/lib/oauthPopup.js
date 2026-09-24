export function oauthPopupFeatures() {
  return 'popup=yes,width=620,height=780,scrollbars=yes'
}

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
