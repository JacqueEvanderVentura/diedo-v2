import { useEffect, useRef, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useConfigStore } from '@/stores/configStore'
import { digitsOnly, fillTemplate, waMeUrl } from '@/lib/whatsapp'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { cn } from '@/lib/utils'

const SIZES = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
}

const ICON_SIZES = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-4 w-4',
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
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const send = (tpl) => {
    if (!digitsOnly(phone)) {
      toast.error('Este contacto no tiene teléfono')
      return
    }
    const text = fillTemplate(tpl.body, variables)
    const url = waMeUrl(phone, text)
    if (!url) {
      toast.error('Teléfono no válido para WhatsApp')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  const onToggle = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (!templates.length) {
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
      <button
        ref={anchorRef}
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        data-testid={testId}
        onClick={onToggle}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600',
          SIZES[size],
          className
        )}
      >
        <MessageCircle className={ICON_SIZES[size]} />
      </button>
      <DropdownPanel
        open={open}
        anchorRef={anchorRef}
        menuRef={menuRef}
        placement="bottom"
        align="end"
        width={240}
        estimatedHeight={templates.length * 44 + 16}
        zIndex={200}
        data-testid={testId ? `${testId}-menu` : undefined}
      >
        <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Plantilla</p>
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              send(tpl)
            }}
            className="flex w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {tpl.name}
          </button>
        ))}
      </DropdownPanel>
    </>
  )
}
