import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { cn } from '@/lib/utils'

export function CreatablePicker({
  value = '',
  onChange,
  options = [],
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  createLabel = 'Crear nuevo',
  onCreate,
  disabled = false,
  className,
  'data-testid': testId,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const items = useMemo(
    () => options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt)),
    [options]
  )
  const selected = items.find((opt) => opt.value === value) || (value ? { value, label: value } : null)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? items.filter((opt) => opt.label.toLowerCase().includes(q))
    : items

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const onClick = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const pick = (next) => {
    onChange?.(next)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={cn('relative min-w-0', className)}>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        data-testid={testId}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between rounded-xl border-0 bg-white py-3 pl-4 pr-10 text-left text-sm font-medium shadow-sm ring-1 ring-inset ring-slate-200 transition-shadow focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50',
          selected ? 'text-slate-900' : 'text-slate-400'
        )}
      >
        <span className="min-w-0 flex-1 truncate pr-2">{selected?.label ?? placeholder}</span>
        <ChevronDown
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      <DropdownPanel
        open={open}
        anchorRef={btnRef}
        menuRef={menuRef}
        align="start"
        estimatedHeight={320}
        zIndex={120}
        className="min-w-[16rem] p-0"
        data-testid={testId ? `${testId}-menu` : undefined}
      >
        {onCreate && (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onCreate(query.trim())
            }}
            data-testid={testId ? `${testId}-create` : undefined}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors hover:bg-blue-50"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Plus className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-blue-700">{createLabel}</span>
          </button>
        )}

        <div className="border-b border-slate-100 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              data-testid={testId ? `${testId}-search` : undefined}
              className="w-full rounded-lg border-0 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 ring-1 ring-inset ring-transparent placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="max-h-52 overflow-y-auto p-1.5 scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">Sin coincidencias</p>
          ) : (
            filtered.map((opt) => {
              const active = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => pick(opt.value)}
                  data-testid={testId ? `${testId}-option-${opt.value}` : undefined}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <span className={cn('min-w-0 flex-1 text-sm', active ? 'font-semibold text-blue-700' : 'font-medium text-slate-800')}>
                    {opt.label}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              )
            })
          )}
        </div>
      </DropdownPanel>
    </div>
  )
}
