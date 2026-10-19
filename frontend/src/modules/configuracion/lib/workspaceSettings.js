import { billingDocumentsToApi, mapWorkspaceBillingDocumentsFromApi } from '@/services/adapters/administration'
import { normalizeBillingDocumentsState } from './billingDocuments'
import { administrationGateway } from '@/services/administrationApi'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'

let workspaceBillingHydratePromise = null

export function mapWorkspaceSettingsFromApi(settings) {
  const billingRaw = settings.billingDocuments || settings.billing_documents
  return {
    businessName: settings.name,
    region: settings.locale,
    taxDefault: Number(settings.taxDefaultRate ?? settings.tax_default_rate ?? 0),
    version: settings.version,
    billingDocuments: billingRaw
      ? mapWorkspaceBillingDocumentsFromApi(billingRaw)
      : normalizeBillingDocumentsState(null),
  }
}

function billingDocumentsToApiCamel(billingDocuments = {}) {
  const raw = billingDocumentsToApi(billingDocuments)
  return {
    templates: (raw.templates || []).map((template) => ({
      id: template.id,
      name: template.name,
      branchIds: template.branch_ids || [],
      tradeName: template.trade_name,
      legalName: template.legal_name,
      rnc: template.rnc,
      address: template.address,
      phone: template.phone,
      email: template.email,
      logoDataUrl: template.logo_data_url,
      footerNote: template.footer_note,
    })),
  }
}

export function workspaceBillingDocumentsPatchToApi(billingDocuments, version) {
  return {
    version,
    billingDocuments: billingDocumentsToApiCamel(billingDocuments),
  }
}

export function applyWorkspaceSettingsToConfigStore(mapped) {
  if (!mapped) return useConfigStore.getState().settings
  useConfigStore.getState().updateSettings({
    businessName: mapped.businessName,
    region: mapped.region,
    taxDefault: mapped.taxDefault,
    version: mapped.version,
    billingDocuments: mapped.billingDocuments,
  })
  useConfigStore.getState().markWorkspaceBillingHydrated(true)
  return useConfigStore.getState().settings
}

export async function hydrateWorkspaceBillingSettings({ force = false } = {}) {
  const session = useSessionStore.getState()
  if (session.status !== 'online') {
    useConfigStore.getState().markWorkspaceBillingHydrated(true)
    return useConfigStore.getState().settings
  }
  if (!force && useConfigStore.getState().workspaceBillingHydrated) {
    return useConfigStore.getState().settings
  }
  if (!workspaceBillingHydratePromise) {
    workspaceBillingHydratePromise = (async () => {
      const result = await administrationGateway.read('workspaceSettings')
      const mapped = result?.data ? mapWorkspaceSettingsFromApi(result.data) : null
      const settings = applyWorkspaceSettingsToConfigStore(mapped)
      return settings
    })().finally(() => {
      workspaceBillingHydratePromise = null
    })
  }
  return workspaceBillingHydratePromise
}

export async function ensureWorkspaceBillingSettings(fallbackSettings) {
  try {
    return await hydrateWorkspaceBillingSettings()
  } catch {
    return useConfigStore.getState().settings || fallbackSettings || {}
  }
}
