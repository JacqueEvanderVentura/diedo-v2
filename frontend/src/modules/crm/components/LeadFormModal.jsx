import { useCrmCapabilities } from '@/modules/crm/hooks/useCrmCapabilities'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { useConfigStore } from '@/stores/configStore'
import { useCrmStore } from '@/stores/crmStore'
import {
  ACQUISITION_SOURCES,
  ACQUISITION_SOURCE_LABELS,
  defaultAcquisitionSourceForForm,
} from '@/data/crm'
import { cn } from '@/lib/utils'
import { buildLeadSubmitPayload, inferLeadCustomerType } from '../lib/leadForm'
import { resolveInstagramUrl } from '../lib/simplifiedOffer'

const emptyForm = (branchId = '') => ({
  branchId,
  customerType: 'b2c',
  name: '',
  company: '',
  email: '',
  phone: '',
  website: '',
  instagramUrl: '',
  location: '',
  acquisitionSource: 'whatsapp',
})

function formFromLead(lead, defaultBranch) {
  if (!lead) return emptyForm(defaultBranch)
  const customerType = inferLeadCustomerType(lead)
  return {
    branchId: lead.branchId || defaultBranch,
    customerType,
    name: lead.name || '',
    company: customerType === 'b2c' ? '' : (lead.company || ''),
    email: lead.email || '',
    phone: lead.phone || '',
    website: lead.website || '',
    instagramUrl: lead.instagramUrl || resolveInstagramUrl(lead) || '',
    location: lead.location || '',
    acquisitionSource: defaultAcquisitionSourceForForm(lead),
  }
}

export function LeadFormModal({ open, onClose, onSaved, lead = null }) {
  const branches = useConfigStore((state) => state.branches)
  const addLead = useCrmStore((state) => state.addLead)
  const updateLead = useCrmStore((state) => state.updateLead)
  const [form, setForm] = useState(emptyForm())
  const can = useCrmCapabilities()
  const [submitting, setSubmitting] = useState(false)
  const isEdit = Boolean(lead?.id)
  const isB2b = form.customerType === 'b2b'

  useEffect(() => {
    if (!open) return
    const defaultBranch = branches.find((branch) => branch.active)?.id || ''
    setForm(formFromLead(lead, defaultBranch))
    setSubmitting(false)
  }, [branches, open, lead])

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const setCustomerType = (value) => {
    setForm((current) => ({
      ...current,
      customerType: value,
      company: value === 'b2c' ? '' : current.company,
      website: value === 'b2c' ? '' : current.website,
    }))
  }

  const submit = async () => {
    if (!isEdit && !form.branchId) return toast.error('Selecciona una sucursal')
    const built = buildLeadSubmitPayload(form)
    if (built.error) return toast.error(built.error)
    setSubmitting(true)
    try {
      const payload = {
        name: built.name,
        company: built.company,
        email: built.email,
        phone: built.phone,
        website: built.website,
        instagramUrl: built.instagramUrl,
        location: built.location,
        acquisitionSource: built.acquisitionSource,
        customerType: built.customerType,
      }
      if (isEdit) {
        await updateLead(lead.id, payload)
        toast.success('Lead actualizado')
      } else {
        await addLead({
          ...form,
          ...payload,
          source: 'manual',
          status: 'nuevo',
        })
        toast.success('Lead creado')
      }
      onSaved?.()
      onClose()
    } catch (error) {
      toast.error(error.message || (isEdit ? 'No se pudo actualizar el lead' : 'No se pudo crear el lead'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar lead' : 'Nuevo lead'}
      testId="lead-form-modal"
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!isEdit && (
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Sucursal</label>
            <BranchMultiSelect
              branches={branches}
              branchIds={form.branchId ? [form.branchId] : []}
              onChange={(ids) => set('branchId', ids[0] || '')}
              selectionMode="single"
              showAllOption={false}
              className="w-full"
              testId="lead-branch"
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo de lead</label>
          <Select
            value={form.customerType}
            onChange={setCustomerType}
            options={[
              { value: 'b2c', label: 'Consumidor (B2C)' },
              { value: 'b2b', label: 'Empresa (B2B)' },
            ]}
            data-testid="lead-customer-type"
          />
        </div>
        {isB2b ? (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Empresa</label>
              <Input
                value={form.company}
                onChange={(event) => set('company', event.target.value)}
                placeholder="Nombre comercial o razón social"
                data-testid="lead-company"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">
                Contacto <span className="text-slate-400">(opcional)</span>
              </label>
              <Input
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="Nombre del contacto"
                data-testid="lead-name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Correo</label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => set('email', event.target.value)}
                placeholder="contacto@empresa.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono</label>
              <Input
                value={form.phone}
                onChange={(event) => set('phone', event.target.value)}
                placeholder="809-555-0000"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Sitio web</label>
              <Input
                type="url"
                value={form.website}
                onChange={(event) => set('website', event.target.value)}
                placeholder="https://empresa.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">IG</label>
              <Input
                type="url"
                value={form.instagramUrl}
                onChange={(event) => set('instagramUrl', event.target.value)}
                placeholder="https://www.instagram.com/usuario"
                data-testid="lead-instagram"
              />
            </div>
          </>
        ) : (
          <>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
              <Input
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="Ej. Juan Pérez"
                data-testid="lead-name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Correo</label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => set('email', event.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono</label>
              <Input
                value={form.phone}
                onChange={(event) => set('phone', event.target.value)}
                placeholder="809-555-0000"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">IG</label>
              <Input
                type="url"
                value={form.instagramUrl}
                onChange={(event) => set('instagramUrl', event.target.value)}
                placeholder="https://www.instagram.com/usuario"
                data-testid="lead-instagram"
              />
            </div>
          </>
        )}
        <div className={isB2b ? '' : 'sm:col-span-2'}>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Ubicación</label>
          <Input
            value={form.location}
            onChange={(event) => set('location', event.target.value)}
            placeholder="Ciudad o sector"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Origen de captación</label>
          <div className="flex flex-wrap gap-2" data-testid="lead-acquisition">
            {ACQUISITION_SOURCES.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => set('acquisitionSource', source)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  form.acquisitionSource === source
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:border-blue-200'
                )}
              >
                {ACQUISITION_SOURCE_LABELS[source]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
        <Button onClick={submit} disabled={submitting || !can.manage} data-testid="lead-submit">
          <Save className="h-4 w-4" /> {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear lead'}
        </Button>
      </div>
    </Modal>
  )
}
