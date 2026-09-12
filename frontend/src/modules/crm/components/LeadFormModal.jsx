import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { useConfigStore } from '@/stores/configStore'
import { useCrmStore } from '@/stores/crmStore'
import { ACQUISITION_SOURCES, ACQUISITION_SOURCE_LABELS } from '@/data/crm'
import { cn } from '@/lib/utils'

const emptyForm = (branchId = '') => ({
  branchId,
  name: '',
  company: '',
  email: '',
  phone: '',
  website: '',
  location: '',
  acquisitionSource: 'whatsapp',
})

export function LeadFormModal({ open, onClose }) {
  const branches = useConfigStore((state) => state.branches)
  const addLead = useCrmStore((state) => state.addLead)
  const [form, setForm] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    const defaultBranch = branches.find((branch) => branch.active)?.id || ''
    setForm(emptyForm(defaultBranch))
    setSubmitting(false)
  }, [branches, open])

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const submit = async () => {
    if (!form.branchId) return toast.error('Selecciona una sucursal')
    if (!form.name.trim() && !form.company.trim()) {
      return toast.error('Indica el nombre o la empresa del lead')
    }
    setSubmitting(true)
    try {
      await addLead({
        ...form,
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        location: form.location.trim() || null,
        source: 'manual',
        acquisitionSource: form.acquisitionSource || null,
        status: 'nuevo',
      })
      toast.success('Lead creado')
      onClose()
    } catch (error) {
      toast.error(error.message || 'No se pudo crear el lead')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo lead" testId="lead-form-modal" wide>
      <div className="grid gap-4 sm:grid-cols-2">
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
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Contacto</label>
          <Input value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Nombre del contacto" data-testid="lead-name" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Empresa</label>
          <Input value={form.company} onChange={(event) => set('company', event.target.value)} placeholder="Empresa" data-testid="lead-company" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Correo</label>
          <Input type="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="contacto@empresa.com" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono</label>
          <Input value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="809-555-0000" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Sitio web</label>
          <Input type="url" value={form.website} onChange={(event) => set('website', event.target.value)} placeholder="https://empresa.com" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">Ubicación</label>
          <Input value={form.location} onChange={(event) => set('location', event.target.value)} placeholder="Ciudad o sector" />
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
        <Button onClick={submit} disabled={submitting} data-testid="lead-submit">
          <Save className="h-4 w-4" /> {submitting ? 'Guardando…' : 'Crear lead'}
        </Button>
      </div>
    </Modal>
  )
}
