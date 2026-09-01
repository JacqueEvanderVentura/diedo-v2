import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, Search, Store, ChevronDown, Check, Lock, Unlock, ReceiptText } from 'lucide-react'
import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { useUiStore } from '@/stores/uiStore'
import { useSessionStore } from '@/stores/sessionStore'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { cn } from '@/lib/utils'

function BranchSelector() {
  const branchId = usePosStore((s) => s.branchId)
  const setBranch = usePosStore((s) => s.setBranch)
  const branches = useConfigStore((s) => s.branches)
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const current = branches.find((b) => b.id === branchId) || branches[0]

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        data-testid="pos-branch-selector"
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <Store className="h-4 w-4 text-slate-400" />
        <span className="hidden sm:inline">{current.name}</span>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      <DropdownPanel
        open={open}
        anchorRef={btnRef}
        menuRef={menuRef}
        align="end"
        width={224}
        estimatedHeight={branches.length * 44 + 12}
        zIndex={40}
      >
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => {
              setBranch(b.id)
              setOpen(false)
            }}
            data-testid={`pos-branch-${b.id}`}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {b.name}
            {branchId === b.id && <Check className="h-4 w-4 text-blue-600" />}
          </button>
        ))}
      </DropdownPanel>
    </div>
  )
}

export function PosTopBar({ query, onQueryChange }) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const navigate = useNavigate()
  const registerOpen = usePosStore((s) => s.register.open)
  const pendingCxc = usePosStore((s) => s.receivables.filter((r) => r.status === 'pending').length)
  const canReadCash = useSessionStore((s) => s.hasPermission('pos.cash.read'))
  const canReadReceivables = useSessionStore((s) => s.hasPermission('pos.receivables.read'))

  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-white/85 p-4 backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          data-testid="pos-menu-toggle"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden sm:block">
          <h1 className="font-heading text-lg font-bold tracking-tight text-slate-900">Terminal POS</h1>
          <p className="text-xs text-slate-400">Punto de Venta</p>
        </div>
      </div>

      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar productos, SKUs o códigos..."
          data-testid="pos-search"
          className="w-full rounded-xl border-0 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-700 ring-1 ring-inset ring-transparent placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
        />
      </div>

      <div className="flex items-center gap-2">
        <BranchSelector />

        {canReadReceivables && (
          <button
            onClick={() => navigate('/pos/cuentas-por-cobrar')}
            data-testid="pos-cxc-shortcut"
            className="relative inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-600"
          >
            <ReceiptText className="h-4 w-4" />
            <span className="hidden md:inline">Por Cobrar</span>
            {pendingCxc > 0 && (
              <span
                data-testid="pos-cxc-badge"
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white"
              >
                {pendingCxc}
              </span>
            )}
          </button>
        )}

        {canReadCash && (
          <button
            onClick={() => navigate('/pos/caja')}
            data-testid="pos-caja-shortcut"
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
              registerOpen ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
            )}
          >
            {registerOpen ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            <span className="hidden sm:inline">{registerOpen ? 'Cerrar Caja' : 'Abrir Caja'}</span>
          </button>
        )}
      </div>
    </header>
  )
}
