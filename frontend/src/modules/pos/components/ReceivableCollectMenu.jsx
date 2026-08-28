import { useState, useRef, useEffect } from 'react'
import { CheckCircle2, ChevronDown, Upload, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { cn } from '@/lib/utils'

export function ReceivableCollectMenu({ row, onConfirm, onCash, onProof, size = 'sm', testId }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <>
      <Button
        ref={btnRef}
        size={size}
        onClick={() => setOpen((o) => !o)}
        data-testid={testId || `cxc-collect-${row.id}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Cobrar
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </Button>
      <DropdownPanel
        open={open}
        anchorRef={btnRef}
        menuRef={menuRef}
        align="end"
        width={240}
        estimatedHeight={144}
        zIndex={90}
      >
        <button
          type="button"
          onClick={() => { setOpen(false); onConfirm(row) }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
          data-testid={`cxc-confirm-${row.id}`}
        >
          <CheckCircle2 className="h-4 w-4 text-blue-600" />
          Confirmar pago
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); onCash(row) }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
          data-testid={`cxc-cash-${row.id}`}
        >
          <Banknote className="h-4 w-4 text-emerald-600" />
          Cobrar en efectivo
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); onProof(row) }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-violet-50 hover:text-violet-700"
          data-testid={`cxc-proof-${row.id}`}
        >
          <Upload className="h-4 w-4 text-violet-600" />
          Validar con comprobante
        </button>
      </DropdownPanel>
    </>
  )
}
