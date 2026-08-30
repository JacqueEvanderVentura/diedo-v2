import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AnimatedTabPanel } from '@/components/ui/AnimatedTabPanel'
import { branchErrorTarget } from '@/services/adapters/administration'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'fiscal', label: 'Datos Fiscales' },
  { id: 'socios', label: 'Socios' },
]

const empty = (legalEntities = []) => {
  const defaultLegalEntity = legalEntities.find((entity) => entity.active)
  return {
    name: '',
    address: '',
    phone: '',
    email: '',
    manager: '',
    schedule: '09:00 - 21:00',
    active: true,
    independentBusiness: false,
    legalName: '',
    legalDisplayName: '',
    rnc: '',
    fiscalEffectiveFrom: '',
    partners: [],
    legalEntityMode: defaultLegalEntity ? 'existing' : 'new',
    legalEntityAction: 'current',
    targetLegalEntityId: defaultLegalEntity?.id || '',
  }
}

function fiscalDraftFromEntity(entity) {
  return {
    legalName: entity?.legalName || '',
    legalDisplayName: entity?.displayName || '',
    rnc: entity?.rnc || '',
    fiscalEffectiveFrom: entity?.taxIdentity?.validFrom || '',
  }
}

function fiscalDataLabel(entity) {
  if (!entity) return ''
  if (entity.referenceOnly) {
    return entity.label?.replace(/^Entidad vinculada a /, 'Datos fiscales de ') || 'Datos fiscales existentes'
  }
  return `${entity.legalName}${entity.rnc ? ` · RNC ${entity.rnc}` : ''}`
}

function FieldError({ error, field }) {
  if (error?.field !== field) return null
  return <p className="mt-1 text-xs font-medium text-red-600">{error.message}</p>
}

export function BranchFormModal({
  open,
  onClose,
  branch,
  onSubmit,
  online = false,
  legalEntities = [],
  canManageBranch = true,
  canReadLegalEntity = true,
  canManageLegalEntity = true,
  supportsAtomicNewEntity = true,
}) {
  const [tab, setTab] = useState('general')
  const [form, setForm] = useState(empty(legalEntities))
  const [partnerName, setPartnerName] = useState('')
  const [partnerShare, setPartnerShare] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showFiscalAssignmentOptions, setShowFiscalAssignmentOptions] = useState(false)
  const initializedForOpen = useRef(false)
  const editing = Boolean(branch)

  useEffect(() => {
    if (!open) {
      initializedForOpen.current = false
      return
    }
    if (initializedForOpen.current) return
    initializedForOpen.current = true
    const defaults = empty(legalEntities)
    setTab('general')
    setForm(branch
      ? {
          ...defaults,
          ...branch,
          legalEntityAction: 'current',
          targetLegalEntityId: legalEntities.find((entity) => entity.id !== branch.legalEntityId)?.id || '',
        }
      : defaults)
    setPartnerName('')
    setPartnerShare('')
    setError(null)
    setSubmitting(false)
    setShowFiscalAssignmentOptions(false)
  }, [open, branch, legalEntities])

  const selectableEntities = useMemo(
    () => legalEntities.filter((entity) => entity.active && (!editing || entity.id !== branch?.legalEntityId)),
    [branch?.legalEntityId, editing, legalEntities]
  )
  const selectedTarget = legalEntities.find((entity) => entity.id === form.targetLegalEntityId)

  const fiscalMode = editing ? form.legalEntityAction : form.legalEntityMode
  const creatingFiscalEntity = fiscalMode === 'new'
  const selectingExistingEntity = fiscalMode === 'existing'
  const fiscalEditable = !online || creatingFiscalEntity || (editing && fiscalMode === 'current')
  const canSubmit = !online || (
    editing
      ? tab === 'fiscal'
        ? fiscalMode === 'current'
          ? canManageLegalEntity
          : canManageBranch && canManageLegalEntity
        : canManageBranch
      : canManageBranch && (!creatingFiscalEntity || (canManageLegalEntity && supportsAtomicNewEntity))
  )

  const set = (key, value) => {
    setError((current) => (current?.field === key ? null : current))
    setForm((current) => ({ ...current, [key]: value }))
  }

  const chooseFiscalMode = (value) => {
    const previousMode = editing ? form.legalEntityAction : form.legalEntityMode
    const patch = editing ? { legalEntityAction: value } : { legalEntityMode: value }
    if (value === 'current') Object.assign(patch, fiscalDraftFromEntity(branch?.legalEntity))
    if (value === 'existing') {
      const target = selectableEntities.find((entity) => entity.id === form.targetLegalEntityId) || selectableEntities[0]
      patch.targetLegalEntityId = target?.id || ''
    }
    if (value === 'new' && previousMode !== 'new') {
      Object.assign(patch, {
        legalName: '',
        legalDisplayName: '',
        rnc: '',
        fiscalEffectiveFrom: '',
      })
    }
    setError(null)
    setForm((current) => ({ ...current, ...patch }))
  }

  const chooseFiscalAssignment = (value) => {
    chooseFiscalMode(value)
    setShowFiscalAssignmentOptions(false)
  }

  const keepCurrentFiscalData = () => {
    chooseFiscalMode('current')
    setShowFiscalAssignmentOptions(false)
  }

  const addPartner = () => {
    if (!partnerName.trim()) return
    setForm((current) => ({
      ...current,
      partners: [...(current.partners || []), { name: partnerName.trim(), share: Number(partnerShare) || 0 }],
    }))
    setPartnerName('')
    setPartnerShare('')
  }

  const removePartner = (index) => {
    setForm((current) => ({
      ...current,
      partners: current.partners.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  const failValidation = (message, nextTab, field) => {
    setTab(nextTab)
    setError({ message, field })
  }

  const validate = () => {
    if ((!editing || tab === 'general') && !form.name.trim()) {
      failValidation('Ingresa el nombre de la sucursal.', 'general', 'name')
      return false
    }
    if ((!editing || tab === 'general') && !form.address.trim()) {
      failValidation('Ingresa la dirección.', 'general', 'address')
      return false
    }
    if (online && (!editing || tab === 'fiscal')) {
      if (selectingExistingEntity && !form.targetLegalEntityId) {
        failValidation('Selecciona los datos fiscales que usará la sucursal.', 'fiscal', 'targetLegalEntityId')
        return false
      }
      if ((creatingFiscalEntity || fiscalMode === 'current') && !form.legalName.trim()) {
        failValidation('Ingresa la razón social.', 'fiscal', 'legalName')
        return false
      }
      if (creatingFiscalEntity && !form.rnc.trim()) {
        failValidation('Ingresa el RNC de los datos fiscales propios.', 'fiscal', 'rnc')
        return false
      }
    }
    return true
  }

  const submit = async () => {
    if (submitting || !canSubmit || !validate()) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(form, { tab })
      onClose()
    } catch (submitError) {
      const target = branchErrorTarget(submitError?.parameter, tab)
      setTab(target.tab)
      setError({
        message: submitError?.message || 'No se pudo guardar la sucursal.',
        field: target.field,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const requestClose = () => {
    if (!submitting) onClose()
  }

  const branchFieldsDisabled = online && !canManageBranch
  const fiscalFieldsDisabled = online && (!canManageLegalEntity || !fiscalEditable)
  const assignmentDisabled = online && (!canManageBranch || !canManageLegalEntity)
  const activeEntities = legalEntities.filter((entity) => entity.active)
  const canCreateOwnFiscalData = supportsAtomicNewEntity && canManageLegalEntity
  const canChangeFiscalData = editing
    && canReadLegalEntity
    && !assignmentDisabled
    && (selectableEntities.length > 0 || supportsAtomicNewEntity)

  return (
    <Modal open={open} onClose={requestClose} title={editing ? 'Editar Sucursal' : 'Nueva Sucursal'} wide testId="sucursal-modal">
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`branch-tab-${item.id}`}
            disabled={submitting}
            onClick={() => { setTab(item.id); setError(null) }}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50',
              tab === item.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <AnimatedTabPanel panelKey={tab}>
        {tab === 'general' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre *</label>
              <Input data-testid="branch-name" value={form.name} disabled={submitting || branchFieldsDisabled} aria-invalid={error?.field === 'name'} onChange={(event) => set('name', event.target.value)} placeholder="Nombre de la sucursal" />
              <FieldError error={error} field="name" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Dirección *</label>
              <Input data-testid="branch-address" value={form.address} disabled={submitting || branchFieldsDisabled} aria-invalid={error?.field === 'address'} onChange={(event) => set('address', event.target.value)} placeholder="Dirección completa" />
              <FieldError error={error} field="address" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono</label><Input data-testid="branch-phone" value={form.phone} disabled={submitting || branchFieldsDisabled} onChange={(event) => set('phone', event.target.value)} placeholder="+1 234 567 890" /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Email</label><Input data-testid="branch-email" value={form.email} disabled={submitting || branchFieldsDisabled} aria-invalid={error?.field === 'email'} onChange={(event) => set('email', event.target.value)} placeholder="sucursal@email.com" /><FieldError error={error} field="email" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Encargado</label><Input data-testid="branch-manager" value={form.manager} disabled={submitting || branchFieldsDisabled} onChange={(event) => set('manager', event.target.value)} placeholder="Nombre del encargado" /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Horario</label><Input data-testid="branch-schedule" value={form.schedule} disabled={submitting || branchFieldsDisabled} onChange={(event) => set('schedule', event.target.value)} placeholder="09:00 - 21:00" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.independentBusiness}
                disabled={submitting || online}
                onChange={(event) => set('independentBusiness', event.target.checked)}
                className="rounded border-slate-300"
              />
              Negocio Independiente
              {online && <span className="text-xs text-slate-400">(se define según sus datos fiscales)</span>}
            </label>
          </div>
        )}

        {tab === 'fiscal' && (
          <div className="space-y-3">
            {online && !editing && selectingExistingEntity && (
              <div className="space-y-2">
                {activeEntities.length > 1 ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-600">Datos fiscales que usará la sucursal</label>
                    <Select
                      data-testid="branch-entity-target"
                      value={form.targetLegalEntityId}
                      disabled={submitting || branchFieldsDisabled}
                      onChange={(value) => set('targetLegalEntityId', value)}
                      options={activeEntities.map((entity) => ({
                        value: entity.id,
                        label: fiscalDataLabel(entity),
                      }))}
                      placeholder="Selecciona los datos fiscales"
                    />
                    <FieldError error={error} field="targetLegalEntityId" />
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600" data-testid="branch-fiscal-default-notice">
                    Datos fiscales para la nueva sucursal: {fiscalDataLabel(selectedTarget) || 'datos actuales del negocio'}.
                  </p>
                )}
                {canCreateOwnFiscalData && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-testid="branch-fiscal-create-own"
                    disabled={submitting || branchFieldsDisabled}
                    onClick={() => chooseFiscalAssignment('new')}
                  >
                    Registrar datos fiscales propios
                  </Button>
                )}
              </div>
            )}

            {online && !editing && creatingFiscalEntity && (
              <div className="flex items-start justify-between gap-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700" data-testid="branch-own-fiscal-notice">
                <p>{activeEntities.length ? 'La sucursal tendrá sus propios datos fiscales.' : 'Registra los datos fiscales del negocio.'}</p>
                {activeEntities.length > 0 && (
                  <button
                    type="button"
                    className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50"
                    disabled={submitting}
                    onClick={() => chooseFiscalAssignment('existing')}
                  >
                    Usar los existentes
                  </button>
                )}
              </div>
            )}

            {online && editing && canReadLegalEntity && fiscalMode === 'current' && showFiscalAssignmentOptions && (
              <div className="rounded-xl bg-slate-50 p-3" data-testid="branch-fiscal-assignment-options">
                <p className="text-sm font-semibold text-slate-700">Cambiar los datos fiscales de esta sucursal</p>
                <p className="mt-1 text-xs text-slate-500">Usa esta opción solo si la sucursal debe tener datos propios o usar los de otra sucursal.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {selectableEntities.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid="branch-fiscal-use-existing"
                      disabled={submitting || assignmentDisabled}
                      onClick={() => chooseFiscalAssignment('existing')}
                    >
                      Usar datos de otra sucursal
                    </Button>
                  )}
                  {supportsAtomicNewEntity && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid="branch-fiscal-create-own"
                      disabled={submitting || assignmentDisabled}
                      onClick={() => chooseFiscalAssignment('new')}
                    >
                      Crear datos fiscales propios
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => setShowFiscalAssignmentOptions(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {online && editing && canReadLegalEntity && fiscalMode !== 'current' && (
              <div className="flex items-start justify-between gap-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700" data-testid="branch-fiscal-change-summary">
                <p>{creatingFiscalEntity ? 'La sucursal tendrá sus propios datos fiscales.' : 'La sucursal usará los datos fiscales seleccionados.'}</p>
                <button
                  type="button"
                  className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50"
                  disabled={submitting}
                  onClick={keepCurrentFiscalData}
                >
                  Cancelar cambio
                </button>
              </div>
            )}

            {online && editing && selectingExistingEntity && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-600">Datos fiscales que usará la sucursal</label>
                <Select
                  data-testid="branch-entity-target"
                  value={form.targetLegalEntityId}
                  disabled={submitting || branchFieldsDisabled || (editing && assignmentDisabled)}
                  onChange={(value) => set('targetLegalEntityId', value)}
                  options={(editing ? selectableEntities : legalEntities.filter((entity) => entity.active)).map((entity) => ({
                    value: entity.id,
                    label: fiscalDataLabel(entity),
                  }))}
                  placeholder="Selecciona los datos fiscales"
                />
                <FieldError error={error} field="targetLegalEntityId" />
                {selectedTarget && !selectedTarget.referenceOnly && (
                  <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600" data-testid="branch-target-summary">
                    <p className="font-semibold text-slate-700">{selectedTarget.legalName}</p>
                    <p>{selectedTarget.rnc ? `RNC ${selectedTarget.rnc}` : 'Sin RNC registrado'}</p>
                    <p>{selectedTarget.sharing.branchCount} sucursal(es) vinculada(s)</p>
                  </div>
                )}
              </div>
            )}

            {online && editing && !canReadLegalEntity && (
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500" data-testid="branch-fiscal-hidden-notice">
                Tu rol no permite consultar los datos fiscales de esta sucursal.
              </p>
            )}

            {(!online || !selectingExistingEntity) && (!online || canReadLegalEntity || !editing) && (
              <>
                {online && editing && fiscalMode === 'current' && branch?.sharing?.shared && (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700" data-testid="branch-shared-warning">
                    Estos datos fiscales se usan en {branch.sharing.branchCount} sucursales. Si los editas, el cambio se aplicará a todas.
                  </p>
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-600">Razón Social</label>
                  <Input data-testid="branch-legal-name" value={form.legalName} disabled={submitting || fiscalFieldsDisabled} aria-invalid={error?.field === 'legalName'} onChange={(event) => set('legalName', event.target.value)} placeholder="Nombre legal de la empresa" />
                  <FieldError error={error} field="legalName" />
                </div>
                <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre comercial</label><Input data-testid="branch-display-name" value={form.legalDisplayName} disabled={submitting || fiscalFieldsDisabled} onChange={(event) => set('legalDisplayName', event.target.value)} placeholder="Nombre de cara al cliente" /></div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-600">RNC</label>
                  <Input data-testid="branch-rnc" value={form.rnc} disabled={submitting || fiscalFieldsDisabled} aria-invalid={error?.field === 'rnc'} onChange={(event) => set('rnc', event.target.value)} placeholder="1-3290890-2" />
                  <FieldError error={error} field="rnc" />
                </div>
                {online && creatingFiscalEntity && <div><label className="mb-1.5 block text-sm font-medium text-slate-600">Vigente desde</label><Input data-testid="branch-fiscal-effective-from" type="date" value={form.fiscalEffectiveFrom} disabled={submitting || fiscalFieldsDisabled} aria-invalid={error?.field === 'fiscalEffectiveFrom'} onChange={(event) => set('fiscalEffectiveFrom', event.target.value)} /><FieldError error={error} field="fiscalEffectiveFrom" /></div>}
                {online && editing && fiscalMode === 'current' && canChangeFiscalData && !showFiscalAssignmentOptions && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-testid="branch-fiscal-change"
                    disabled={submitting}
                    onClick={() => setShowFiscalAssignmentOptions(true)}
                  >
                    Cambiar los datos fiscales de esta sucursal
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'socios' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input data-testid="branch-partner-name" value={partnerName} disabled={submitting || branchFieldsDisabled} onChange={(event) => setPartnerName(event.target.value)} placeholder="Nombre del socio" className="flex-1" />
              <Input data-testid="branch-partner-share" type="number" value={partnerShare} disabled={submitting || branchFieldsDisabled} onChange={(event) => setPartnerShare(event.target.value)} placeholder="%" className="w-20" />
              <Button type="button" variant="secondary" disabled={submitting || branchFieldsDisabled} onClick={addPartner}>Agregar</Button>
            </div>
            {(form.partners || []).length === 0 ? (
              <p className="text-sm text-slate-400">Sin socios registrados.</p>
            ) : (
              <ul className="space-y-2">
                {form.partners.map((partner, index) => (
                  <li key={`${partner.name}-${index}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{partner.name}</span>
                    <span className="flex items-center gap-2 text-slate-500">{partner.share}% <button type="button" disabled={submitting || branchFieldsDisabled} onClick={() => removePartner(index)} className="text-red-500 disabled:opacity-50">×</button></span>
                  </li>
                ))}
              </ul>
            )}
            <FieldError error={error} field="partners" />
          </div>
        )}
      </AnimatedTabPanel>

      {error && !error.field && <p className="mt-3 text-sm text-red-500">{error.message}</p>}
      {error && <p className="sr-only" role="alert" data-testid="branch-form-error">{error.message}</p>}

      {online && !canSubmit && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500" data-testid="branch-read-only-notice">
          Tu rol permite consultar esta información, pero no guardar cambios en esta pestaña.
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={requestClose} disabled={submitting}>Cancelar</Button>
        <Button data-testid="branch-submit" className="flex-1" onClick={submit} disabled={submitting || !canSubmit}>
          {submitting ? 'Guardando…' : editing ? 'Guardar' : 'Crear Sucursal'}
        </Button>
      </div>
    </Modal>
  )
}
