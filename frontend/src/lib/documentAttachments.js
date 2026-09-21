import { apiClient } from '@/services/apiClient'
import { mapDocumentAttachmentFromApi, mapDocumentAttachmentsFromApi } from '@/services/adapters/documentAttachments'

async function uploadFiles(path, attachments = []) {
  const pending = (attachments || []).filter((item) => item.pendingFile)
  const uploaded = []
  for (const item of pending) {
    const formData = new FormData()
    formData.append('file', item.pendingFile, item.name || item.pendingFile.name)
    const response = await apiClient.upload(path, formData)
    uploaded.push(mapDocumentAttachmentFromApi(response))
  }
  return uploaded
}

export async function uploadFinanceExpenseAttachments(expenseId, attachments) {
  return uploadFiles(`/api/v1/finance/expenses/${expenseId}/attachments`, attachments)
}

export async function uploadFinanceFixedAttachments(fixedExpenseId, attachments) {
  return uploadFiles(`/api/v1/finance/fixed-expenses/${fixedExpenseId}/attachments`, attachments)
}

export async function uploadFinanceIncomeAttachments(incomeId, attachments) {
  return uploadFiles(`/api/v1/finance/incomes/${incomeId}/attachments`, attachments)
}

export async function uploadCashMovementAttachments(registerId, movementId, attachments) {
  return uploadFiles(
    `/api/v1/pos/registers/${registerId}/movements/${movementId}/attachments`,
    attachments
  )
}

export async function uploadPurchaseQuote(requestId, quoteFile) {
  if (!quoteFile?.pendingFile) return null
  const formData = new FormData()
  formData.append('file', quoteFile.pendingFile, quoteFile.name || quoteFile.pendingFile.name)
  const response = await apiClient.upload(`/api/v1/purchasing/requests/${requestId}/quote`, formData)
  return mapDocumentAttachmentFromApi(response)
}

export function mergeUploadedAttachments(existing = [], uploaded = []) {
  const localOnly = (existing || []).filter((item) => !item.pendingFile)
  return [...localOnly, ...uploaded]
}

export async function loadDocumentAttachmentBlob(attachment) {
  const url = attachment?.previewUrl || attachment?.downloadUrl
  if (!url) throw new Error('Adjunto no disponible.')
  if (attachment.dataUrl || attachment.previewObjectUrl) {
    const response = await fetch(attachment.dataUrl || attachment.previewObjectUrl)
    return response.blob()
  }
  return apiClient.blob(url)
}

export { mapDocumentAttachmentsFromApi }
