import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Table } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { exportCsv, exportPdf, exportXlsx } from '../lib/export'
import { cn } from '@/lib/utils'

const FORMATS = [
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'csv', label: 'CSV', icon: Table },
  { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
]

export function ExportMenu({ title, columns, rows, filename, subtitle, variant = 'secondary', label = 'Exportar' }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const run = (format) => {
    if (!rows?.length) {
      toast.error('No hay datos para exportar')
      return
    }
    const payload = { title, columns, rows, filename, subtitle }
    if (format === 'pdf') exportPdf(payload)
    else if (format === 'csv') exportCsv(payload)
    else exportXlsx(payload)
    toast.success(`Exportado como ${format.toUpperCase()}`)
    setOpen(false)
  }

  return (
    <div className="relative" data-testid="export-menu">
      <Button ref={btnRef} variant={variant} onClick={() => setOpen((o) => !o)} data-testid="export-menu-trigger">
        <Download className="h-4 w-4" />
        {label}
      </Button>
      <DropdownPanel
        open={open}
        anchorRef={btnRef}
        menuRef={menuRef}
        align="end"
        width={176}
        estimatedHeight={132}
      >
        {FORMATS.map((f) => {
          const Icon = f.icon
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => run(f.id)}
              data-testid={`export-${f.id}`}
              className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50')}
            >
              <Icon className="h-4 w-4 text-slate-400" />
              {f.label}
            </button>
          )
        })}
      </DropdownPanel>
    </div>
  )
}
