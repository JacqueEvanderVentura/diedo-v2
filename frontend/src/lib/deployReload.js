const RELOAD_GUARD_KEY = 'helios360.deployReloadTarget'

export function getVersionUrl(baseUrl) {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${normalized}version.json`
}

export async function fetchRemoteBuildId(versionUrl, fetchFn = fetch) {
  const response = await fetchFn(versionUrl, { cache: 'no-store' })
  if (!response.ok) return null
  const data = await response.json()
  return typeof data?.buildId === 'string' ? data.buildId : null
}

export function shouldReloadForDeploy(currentId, remoteId) {
  if (!currentId || !remoteId) return false
  return remoteId !== currentId
}

export function markReloadAttempted(storage, remoteBuildId) {
  storage.setItem(RELOAD_GUARD_KEY, remoteBuildId)
}

export function hasReloadAttempted(storage, remoteBuildId) {
  return storage.getItem(RELOAD_GUARD_KEY) === remoteBuildId
}

export function clearReloadAttempt(storage) {
  storage.removeItem(RELOAD_GUARD_KEY)
}

/**
 * @returns {Promise<boolean>} true if reload was triggered
 */
export async function checkAndReloadDeploy({
  currentBuildId,
  baseUrl,
  fetchFn = fetch,
  reload = () => window.location.reload(),
  storage = sessionStorage,
}) {
  const remoteId = await fetchRemoteBuildId(getVersionUrl(baseUrl), fetchFn)
  if (!remoteId) return false

  if (!shouldReloadForDeploy(currentBuildId, remoteId)) {
    clearReloadAttempt(storage)
    return false
  }

  if (hasReloadAttempted(storage, remoteId)) return false

  markReloadAttempted(storage, remoteId)
  reload()
  return true
}
