import { apiClient } from './apiClient'

export async function checkHealthReady() {
  try {
    await apiClient.get('/health/ready', undefined, { auth: false, retry: false })
    return true
  } catch {
    return false
  }
}
