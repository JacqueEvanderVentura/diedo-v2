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

export function createBillingTemplateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function createDefaultBillingTemplate(overrides = {}) {
  return {
    id: createBillingTemplateId(),
    name: 'Principal',
    branchIds: [],
    ...DEFAULT_BILLING_DOCUMENTS,
    ...overrides,
  }
}

function isLegacyBillingShape(raw) {
  if (!raw || typeof raw !== 'object') return true
  return !Array.isArray(raw.templates)
}

function mapTemplateFields(raw = {}) {
  return {
    tradeName: raw.tradeName || raw.trade_name || '',
    legalName: raw.legalName || raw.legal_name || '',
    rnc: raw.rnc || '',
    address: raw.address || '',
    phone: raw.phone || '',
    email: raw.email || '',
    logoDataUrl: raw.logoDataUrl || raw.logo_data_url || '',
    footerNote: raw.footerNote || raw.footer_note || '',
  }
}

export function mapBillingTemplateFromApi(raw) {
  if (!raw) return createDefaultBillingTemplate()
  const branchIds = raw.branchIds || raw.branch_ids || []
  return {
    id: String(raw.id || createBillingTemplateId()),
    name: raw.name?.trim() || 'Plantilla',
    branchIds: Array.isArray(branchIds) ? branchIds.map(String) : [],
    ...mapTemplateFields(raw),
  }
}

export function normalizeBillingDocumentsState(raw) {
  if (isLegacyBillingShape(raw)) {
    return {
      templates: [
        createDefaultBillingTemplate({
          name: 'Principal',
          ...mapTemplateFields(raw),
        }),
      ],
    }
  }
  const templates = (raw.templates || []).map(mapBillingTemplateFromApi)
  if (!templates.length) {
    return { templates: [createDefaultBillingTemplate()] }
  }
  return { templates }
}

function pickTemplateForBranch(templates, branchId) {
  if (!templates.length) return createDefaultBillingTemplate()
  if (branchId) {
    const normalizedId = String(branchId)
    const match = templates.find((template) =>
      template.branchIds?.some((id) => String(id) === normalizedId),
    )
    if (match) return match
  }
  return templates[0]
}

export function resolveBillingBranding(settings = {}, branch = null) {
  const { templates } = normalizeBillingDocumentsState(settings.billingDocuments)
  const workspaceBilling = {
    ...DEFAULT_BILLING_DOCUMENTS,
    ...pickTemplateForBranch(templates, branch?.id),
  }
  const branchBilling = branch?.billingDocuments
  const billing = { ...workspaceBilling }
  if (branchBilling) {
    Object.entries(branchBilling).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') billing[key] = value
    })
  }
  return {
    businessName: billing.tradeName?.trim() || settings.businessName || 'Helios 360',
    legalName: billing.legalName?.trim() || '',
    businessRnc: billing.rnc?.trim() || '',
    businessAddress: billing.address?.trim() || branch?.address?.trim() || '',
    businessPhone: billing.phone?.trim() || branch?.phone?.trim() || '',
    businessEmail: billing.email?.trim() || branch?.email?.trim() || '',
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

export function applyBillingBrandingToInvoiceData(data, settings = {}, customers = [], branch = null) {
  const brand = resolveBillingBranding(settings, branch)
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

export function assignBranchToTemplate(templates, templateId, branchIds) {
  const normalizedIds = (branchIds || []).map(String)
  const claimed = new Set(normalizedIds)
  return templates.map((template) => {
    if (template.id === templateId) {
      return { ...template, branchIds: normalizedIds }
    }
    if (!template.branchIds?.length) return template
    const nextBranchIds = template.branchIds.filter((id) => !claimed.has(String(id)))
    return { ...template, branchIds: nextBranchIds }
  })
}
