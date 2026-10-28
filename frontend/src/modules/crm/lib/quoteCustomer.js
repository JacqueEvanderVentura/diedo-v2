import { leadHasDocument } from './leadConversion'
import { syncPipelineCloseCustomer } from './pipelineInvoice'

export const LEAD_NEEDS_DOCUMENT = 'lead_needs_document'

export function leadNeedsDocumentError() {
  const error = new Error('Ingresa la cédula, RNC o pasaporte del lead para crear el cliente.')
  error.code = LEAD_NEEDS_DOCUMENT
  return error
}

export function isLeadNeedsDocumentError(error) {
  return error?.code === LEAD_NEEDS_DOCUMENT
}

/** Links (or creates) the lead's customer through the CRM convert endpoint, which keeps the lead open. */
export async function ensureCustomerForLeadQuote({
  lead,
  convertToCustomer,
  documentOverride = null,
}) {
  if (!lead?.id) return null
  if (lead.customerId) {
    return { id: lead.customerId, leadId: lead.id }
  }
  if (!documentOverride && !leadHasDocument(lead)) {
    throw leadNeedsDocumentError()
  }
  const customer = await convertToCustomer(lead.id, documentOverride)
  if (!customer?.id) return null
  return { ...customer, id: customer.id, leadId: lead.id }
}

export async function ensureCustomerForQuote({
  customerId,
  lead,
  convertToCustomer,
  documentOverride = null,
}) {
  if (customerId) {
    return { id: customerId }
  }
  if (!lead) return null
  return ensureCustomerForLeadQuote({ lead, convertToCustomer, documentOverride })
}

/** Links a customer to the lead for invoicing without marking it as won. */
export async function preparePipelineCloseCustomer({
  lead,
  convertToCustomer,
  updateLead,
  updateQuote,
  quotes = [],
  documentOverride = null,
}) {
  if (!lead?.id) return null
  const customer = await ensureCustomerForLeadQuote({ lead, convertToCustomer, documentOverride })
  if (customer?.id) {
    await syncPipelineCloseCustomer({
      leadId: lead.id,
      customerId: customer.id,
      quotes,
      updateQuote,
      updateLead,
    })
  }
  return customer
}

export async function syncLeadPipelineValue({ leadId, total, updateLead }) {
  if (!leadId || !updateLead || !Number.isFinite(total)) return
  await updateLead(leadId, { pipelineValue: total })
}
