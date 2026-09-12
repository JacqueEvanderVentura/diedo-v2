export const DEFAULT_BILLING_DOCUMENTS = {
  tradeName: '',
  legalName: '',
  rnc: '',
  address: '',
  phone: '',
  email: '',
  logoDataUrl: '',
  footerNote: '',
}

export function resolveBillingBranding(settings = {}) {
  const billing = { ...DEFAULT_BILLING_DOCUMENTS, ...(settings.billingDocuments || {}) }
  return {
    businessName: billing.tradeName?.trim() || settings.businessName || 'Helios 360',
    legalName: billing.legalName?.trim() || '',
    businessRnc: billing.rnc?.trim() || '',
    businessAddress: billing.address?.trim() || '',
    businessPhone: billing.phone?.trim() || '',
    businessEmail: billing.email?.trim() || '',
    logoDataUrl: billing.logoDataUrl || '',
    footerNote: billing.footerNote?.trim() || '',
    region: settings.region || '',
  }
}

/** Cédula (B2C) o RNC (B2B) para cotización / factura. */
export function formatCustomerTaxLine(customer) {
  if (!customer) return ''
  const documentId = String(customer.documentId || '').trim()
  if (!documentId) return ''

  const isB2b = customer.customerType === 'b2b'
  if (isB2b) {
    return `RNC: ${documentId}`
  }
  if (customer.docType === 'pasaporte') {
    return `Pasaporte: ${documentId}`
  }
  return `Cédula: ${documentId}`
}

export function resolveCustomerForDocuments(partial, customers = []) {
  if (!partial) return null
  if (partial.id && customers.length) {
    const full = customers.find((row) => row.id === partial.id)
    if (full) return full
  }
  if (partial.documentId || partial.customerType) return partial
  if (partial.id && customers.length) return customers.find((row) => row.id === partial.id) || partial
  return partial
}

export function applyBillingBrandingToInvoiceData(data, settings = {}, customers = []) {
  const brand = resolveBillingBranding(settings)
  const customer = resolveCustomerForDocuments(
    data.customerRecord || { name: data.customerName, phone: data.customerPhone, id: data.customerId },
    customers,
  )
  const customerTaxLine = formatCustomerTaxLine(customer)

  return {
    ...data,
    businessName: brand.businessName,
    legalName: brand.legalName,
    businessRnc: brand.businessRnc,
    businessAddress: brand.businessAddress,
    businessPhone: brand.businessPhone,
    businessEmail: brand.businessEmail,
    logoDataUrl: brand.logoDataUrl,
    footerNote: brand.footerNote,
    region: data.region || brand.region,
    customerTaxLine,
    customerName: customer?.name || customer?.displayName || data.customerName,
    customerPhone: customer?.phone || data.customerPhone || '',
  }
}
