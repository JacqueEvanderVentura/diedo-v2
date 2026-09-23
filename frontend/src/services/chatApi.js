import { apiClient } from '@/services/apiClient'

export const chatApi = {
  listConversations(params = {}) {
    return apiClient.get('/api/v1/chat/conversations', params)
  },

  listMessages(conversationId, params = {}) {
    return apiClient.get(`/api/v1/chat/conversations/${conversationId}/messages`, params)
  },

  sendMessage(conversationId, body) {
    return apiClient.post(`/api/v1/chat/conversations/${conversationId}/messages`, { body })
  },

  listChannelAccounts() {
    return apiClient.get('/api/v1/chat/channel-accounts')
  },

  startOAuth(channel) {
    const returnOrigin = typeof window === 'undefined' ? undefined : window.location.origin
    return apiClient.post('/api/v1/chat/channel-accounts/oauth/start', {
      channel,
      returnOrigin,
    })
  },

  getOAuthPending(oauthStateId) {
    return apiClient.get('/api/v1/chat/channel-accounts/oauth/pending', {
      params: { oauthStateId },
    })
  },

  completeOAuth({ oauthStateId, providerAccountId }) {
    return apiClient.post('/api/v1/chat/channel-accounts/oauth/complete', {
      oauthStateId,
      providerAccountId,
    })
  },

  updateAccountBranches(accountId, branchIds) {
    return apiClient.put(`/api/v1/chat/channel-accounts/${accountId}/branches`, {
      branchIds,
    })
  },

  disconnectAccount(accountId) {
    return apiClient.post(`/api/v1/chat/channel-accounts/${accountId}/disconnect`)
  },
}
