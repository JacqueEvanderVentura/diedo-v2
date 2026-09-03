function optionalText(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

export function mapLegalEntityFromApi(entity) {
  const taxIdentity = entity.taxIdentity
    ? {
        id: entity.taxIdentity.id,
        jurisdictionCode: entity.taxIdentity.jurisdictionCode,
        identifierType: entity.taxIdentity.identifierType,
        identifierValue: entity.taxIdentity.identifierValue,
        registeredName: entity.taxIdentity.registeredName,
        validFrom: entity.taxIdentity.validFrom,
        validTo: entity.taxIdentity.validTo,
      }
    : null
  return {
    id: entity.id,
    code: entity.code,
    legalName: entity.legalName,
    displayName: entity.displayName || '',
    active: entity.status === 'active',
    status: entity.status,
    version: entity.version,
    taxIdentity,
    rnc: taxIdentity?.identifierValue || '',
    branches: entity.branches || [],
    sharing: {
      branchCount: entity.sharing?.branchCount || 0,
      shared: Boolean(entity.sharing?.shared),
    },
    source: 'api',
  }
}

export function mapBranchFromApi(branch, legalEntities = []) {
  const entity = legalEntities.find((item) => item.id === branch.legalEntityId) || null
  const details = branch.details || {}
  return {
    id: branch.id,
    legalEntityId: branch.legalEntityId,
    code: branch.code,
    name: branch.name,
    active: branch.status === 'active',
    status: branch.status,
    timezone: branch.timezone,
    version: branch.version,
    address: details.address || '',
    phone: details.phone || '',
    email: details.email || '',
    manager: details.manager || '',
    schedule: details.schedule || '',
    independentBusiness: Boolean(details.independentBusiness),
    partners: Array.isArray(details.partners) ? details.partners : [],
    legalEntity: entity,
    legalName: entity?.legalName || '',
    legalDisplayName: entity?.displayName || '',
    rnc: entity?.rnc || '',
    fiscalEffectiveFrom: entity?.taxIdentity?.validFrom || '',
    legalEntityVersion: entity?.version || null,
    sharing: entity?.sharing || { branchCount: 0, shared: false },
    source: 'api',
  }
}

export function mapBranchesFromApi(branches = [], entities = []) {
  const legalEntities = entities.map((entity) => (
    entity.source === 'api' ? entity : mapLegalEntityFromApi(entity)
  ))
  return branches.map((branch) => mapBranchFromApi(branch, legalEntities))
}

export function legalEntityReferencesFromBranches(branches = []) {
  const groups = new Map()
  branches.forEach((branch) => {
    if (!branch.legalEntityId) return
    const group = groups.get(branch.legalEntityId) || []
    group.push({ id: branch.id, code: branch.code, name: branch.name })
    groups.set(branch.legalEntityId, group)
  })
  return [...groups.entries()].map(([id, attachedBranches]) => ({
    id,
    code: '',
    label: `Entidad vinculada a ${attachedBranches.map((branch) => branch.name).join(', ')}`,
    legalName: '',
    displayName: '',
    active: true,
    status: 'active',
    version: null,
    taxIdentity: null,
    rnc: '',
    branches: attachedBranches,
    sharing: {
      branchCount: attachedBranches.length,
      shared: attachedBranches.length > 1,
    },
    referenceOnly: true,
    source: 'api-reference',
  }))
}

export function mapBranchFromDemo(branch) {
  return {
    ...branch,
    legalName: branch.legalName || '',
    legalDisplayName: branch.legalDisplayName || '',
    rnc: branch.rnc || '',
    sharing: branch.sharing || { branchCount: 1, shared: false },
    source: 'demo',
  }
}

export function branchGeneralPatchToApi(form, branch) {
  return {
    name: form.name.trim(),
    status: form.active ? 'active' : 'inactive',
    timezone: form.timezone || branch.timezone,
    details: {
      address: form.address || '',
      phone: form.phone || '',
      email: optionalText(form.email),
      manager: form.manager || '',
      schedule: form.schedule || '',
    },
    version: branch.version,
  }
}

export function branchPartnersPatchToApi(form, branch) {
  return {
    details: {
      partners: (form.partners || []).map((partner) => ({
        name: partner.name.trim(),
        document: optionalText(partner.document),
        share: Number(partner.share) || 0,
      })),
    },
    version: branch.version,
  }
}

export function fiscalProfileToApi(form, version) {
  return {
    legalName: form.legalName.trim(),
    displayName: optionalText(form.legalDisplayName),
    taxIdentity: form.rnc?.trim()
      ? {
          jurisdictionCode: 'DO',
          identifierType: 'RNC',
          identifierValue: form.rnc.trim(),
        }
      : null,
    ...(form.fiscalEffectiveFrom ? { effectiveFrom: form.fiscalEffectiveFrom } : {}),
    version,
  }
}

export function newFiscalProfileToApi(form) {
  const { version: _version, ...profile } = fiscalProfileToApi(form, 1)
  return profile
}

function branchDetailsForCreate(form, independentBusiness) {
  return {
    address: form.address || '',
    phone: form.phone || '',
    email: optionalText(form.email),
    manager: form.manager || '',
    schedule: form.schedule || '',
    independentBusiness,
    partners: (form.partners || []).map((partner) => ({
      name: partner.name.trim(),
      document: optionalText(partner.document),
      share: Number(partner.share) || 0,
    })),
  }
}

export function createBranchToApi(form, { code, timezone }) {
  const creatingEntity = form.legalEntityMode === 'new'
  return {
    legalEntityAssignment: creatingEntity
      ? { type: 'new', fiscalProfile: newFiscalProfileToApi(form) }
      : { type: 'existing', legalEntityId: form.targetLegalEntityId },
    code,
    name: form.name.trim(),
    timezone,
    details: branchDetailsForCreate(form, creatingEntity),
  }
}

export function branchAssignmentToApi(form, branch) {
  return {
    assignment: form.legalEntityAction === 'new'
      ? { type: 'new', fiscalProfile: newFiscalProfileToApi(form) }
      : { type: 'existing', legalEntityId: form.targetLegalEntityId },
    version: branch.version,
  }
}

export function branchErrorTarget(parameter, fallbackTab = 'general') {
  const value = String(parameter || '')
  if (value.includes('partner') || value.includes('partners')) {
    return { tab: 'socios', field: 'partners' }
  }
  if (
    value.includes('legalName')
    || value.includes('displayName')
    || value.includes('taxIdentity')
    || value.includes('fiscalProfile')
    || value.includes('legalEntity')
    || value.includes('assignment')
  ) {
    let field = 'legalName'
    if (value.includes('identifierValue')) field = 'rnc'
    else if (value.includes('displayName')) field = 'legalDisplayName'
    else if (value.includes('effectiveFrom')) field = 'fiscalEffectiveFrom'
    else if (value.includes('legalEntityId')) field = 'targetLegalEntityId'
    return {
      tab: 'fiscal',
      field,
    }
  }
  const field = value.startsWith('details.') ? value.slice('details.'.length) : value
  return { tab: fallbackTab, field: field || null }
}
