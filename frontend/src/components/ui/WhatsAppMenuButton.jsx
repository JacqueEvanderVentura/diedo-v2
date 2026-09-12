import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { WhatsAppIcon } from '@/components/brand/WhatsAppIcon'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { buildWhatsAppVariables, digitsOnly, fillTemplate, waMeUrl } from '@/lib/whatsapp'
import { WHATSAPP_VARIABLE_CHIPS, insertTemplateToken } from '@/lib/whatsappVariables'
import { WhatsAppVariableChips } from '@/components/ui/WhatsAppVariableChips'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { WhatsAppPreviewPanel } from '@/components/ui/WhatsAppPreviewPanel'
import { cn } from '@/lib/utils'

const ICON_SIZES = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-[18px] w-[18px]',
  md: 'h-5 w-5',
}

const BUTTON_PAD = {
  xs: '!px-1.5 !py-1.5',
  sm: '!px-2 !py-2',
  md: '!px-2.5 !py-2.5',
}

const DEFAULT_NEW_TEMPLATE_BODY = {
  agenda: 'Hola {{nombre_cliente}}, ',
  oportunidades: 'Hola {{nombre_cliente}}, ',
  clientes: 'Hola {{firstName}}, ',
}

export function WhatsAppMenuButton({
  phone,
  context = 'clientes',
  variables = {},
  size = 'sm',
  className,
  title = 'Enviar WhatsApp',
  'data-testid': testId,
}) {
  const templates = useConfigStore((s) => s.whatsappTemplates?.[context] || [])
  const addWhatsappTemplate = useConfigStore((s) => s.addWhatsappTemplate)
  const user = useSessionStore((s) => s.user)
  const canCreateTemplate = ['Administrador', 'Gerente'].includes(user?.role)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateBody, setNewTemplateBody] = useState('')
  const anchorRef = useRef(null)
  const menuRef = useRef(null)
  const bodyRef = useRef(null)
  const bodyCaretRef = useRef(0)
  const createFormId = useId()
  const resolvedVariables = buildWhatsAppVariables({
    name: variables.nombre_cliente || variables.name,
    phone: variables.phone || phone,
    company: variables.empresa || variables.company,
    ...variables,
  })
  const variableChips = WHATSAPP_VARIABLE_CHIPS[context] || WHATSAPP_VARIABLE_CHIPS.clientes

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const openCreateModal = () => {
    setNewTemplateName('')
    setNewTemplateBody(DEFAULT_NEW_TEMPLATE_BODY[context] || DEFAULT_NEW_TEMPLATE_BODY.clientes)
    bodyCaretRef.current = (DEFAULT_NEW_TEMPLATE_BODY[context] || DEFAULT_NEW_TEMPLATE_BODY.clientes).length
    setCreating(true)
    setOpen(false)
  }

  const closeCreateModal = () => {
    setCreating(false)
    setNewTemplateName('')
    setNewTemplateBody('')
  }

  const openPreview = (tpl) => {
    if (!digitsOnly(phone)) {
      toast.error('Este contacto no tiene teléfono')
      return
    }
    setPreview({
      template: tpl,
      message: fillTemplate(tpl.body, resolvedVariables),
    })
    setOpen(false)
  }

  const sendPreview = () => {
    if (!preview) return
    const url = waMeUrl(phone, preview.message)
    if (!url) {
      toast.error('Teléfono no válido para WhatsApp')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    setPreview(null)
  }

  const syncBodyCaret = () => {
    if (bodyRef.current) bodyCaretRef.current = bodyRef.current.selectionStart
  }

  const insertVariable = (key) => {
    const next = insertTemplateToken(newTemplateBody, key, bodyCaretRef.current)
    setNewTemplateBody(next.body)
    bodyCaretRef.current = next.caret
    requestAnimationFrame(() => {
      if (!bodyRef.current) return
      bodyRef.current.focus()
      bodyRef.current.setSelectionRange(next.caret, next.caret)
    })
  }

  const createPreviewMessage = useMemo(
    () => fillTemplate(newTemplateBody, resolvedVariables),
    [newTemplateBody, resolvedVariables]
  )

  const createTemplate = () => {
    const name = newTemplateName.trim()
    const body = newTemplateBody.trim()
    if (!name) return toast.error('Ingresa un nombre para la plantilla')
    if (!body) return toast.error('Escribe el cuerpo del mensaje')
    addWhatsappTemplate(context, {
      id: `custom-${Date.now().toString(36)}`,
      name,
      body,
    })
    closeCreateModal()
    toast.success('Plantilla creada')
  }

  const onToggle = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (!templates.length && !canCreateTemplate) {
      toast.error('No hay plantillas configuradas')
      return
    }
    if (!digitsOnly(phone)) {
      toast.error('Este contacto no tiene teléfono')
      return
    }
    setOpen((v) => !v)
  }

  return (
    <>
      <Button
        ref={anchorRef}
        type="button"
        variant="secondary"
        size="sm"
        title={title}
        aria-label={title}
        aria-expanded={open}
        data-testid={testId}
        onClick={onToggle}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('shrink-0 text-[#25D366] hover:text-[#1ebe57]', BUTTON_PAD[size], className)}
      >
        <WhatsAppIcon className={ICON_SIZES[size]} />
      </Button>
      <DropdownPanel
        open={open}
        anchorRef={anchorRef}
        menuRef={menuRef}
        placement="bottom"
        align="end"
        width={260}
        estimatedHeight={(templates.length + (canCreateTemplate ? 1 : 0)) * 44 + 24}
        zIndex={200}
        data-testid={testId ? `${testId}-menu` : undefined}
      >
        <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Plantilla</p>
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              openPreview(tpl)
            }}
            className="flex w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            data-testid={testId ? `${testId}-option-${tpl.id}` : undefined}
          >
            {tpl.name}
          </button>
        ))}
        {canCreateTemplate && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              openCreateModal()
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
            data-testid={testId ? `${testId}-create-template` : undefined}
          >
            <Plus className="h-4 w-4" /> Crear plantilla
          </button>
        )}
      </DropdownPanel>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.template?.name || 'Vista previa'}
        wide
        testId={testId ? `${testId}-preview` : 'wa-preview-modal'}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Revisa el mensaje con los datos de este contacto antes de abrir WhatsApp.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>Cancelar</Button>
              <Button onClick={sendPreview} data-testid={testId ? `${testId}-send` : 'wa-preview-send'}>
                Enviar por WhatsApp
              </Button>
            </div>
          </div>
          <WhatsAppPreviewPanel message={preview?.message} />
        </div>
      </Modal>

      <Modal
        open={creating}
        onClose={closeCreateModal}
        title="Nueva plantilla"
        xlarge
        bodyClassName="max-h-[min(85vh,900px)] overflow-y-auto"
        testId={testId ? `${testId}-create-modal` : 'wa-create-modal'}
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
          <div className="min-w-0 space-y-4">
            <div>
              <label htmlFor={`${createFormId}-name`} className="mb-1.5 block text-sm font-medium text-slate-600">
                Nombre de la plantilla
              </label>
              <Input
                id={`${createFormId}-name`}
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder="Ej. Seguimiento post cita"
                data-testid={testId ? `${testId}-create-name` : 'wa-create-name'}
              />
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Variables</p>
              <WhatsAppVariableChips
                chips={variableChips}
                resolvedVariables={resolvedVariables}
                onInsert={insertVariable}
                onMouseDown={(e) => e.stopPropagation()}
                testIdPrefix={testId ? `${testId}-create` : 'wa-create'}
              />
              <p className="mt-2 text-xs text-slate-400">
                Las variables en color se rellenan con los datos de este contacto al enviar; las grises no tienen valor aún
                (ej. empresa en B2C o cita si no hay próxima cita).
              </p>
            </div>

            <div>
              <label htmlFor={`${createFormId}-body`} className="mb-1.5 block text-sm font-medium text-slate-600">
                Mensaje
              </label>
              <textarea
                id={`${createFormId}-body`}
                ref={bodyRef}
                value={newTemplateBody}
                onChange={(e) => setNewTemplateBody(e.target.value)}
                onSelect={syncBodyCaret}
                onKeyUp={syncBodyCaret}
                onClick={syncBodyCaret}
                onMouseDown={(e) => e.stopPropagation()}
                rows={8}
                placeholder="Escribe el mensaje aquí..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                data-testid={testId ? `${testId}-create-body` : 'wa-create-body'}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeCreateModal}>Cancelar</Button>
              <Button onClick={createTemplate} data-testid={testId ? `${testId}-create-submit` : 'wa-create-submit'}>
                Crear plantilla
              </Button>
            </div>
          </div>

          <WhatsAppPreviewPanel
            message={createPreviewMessage}
            emptyHint="Escribe el mensaje para ver cómo se verá en WhatsApp."
          />
        </div>
      </Modal>
    </>
  )
}
