import { apiClient } from './apiClient'

export async function checkHealthReady() {
  try {
    return await apiClient.get('/health/ready', undefined, { auth: false, retry: false })
  } catch {
    return null
  }
}
