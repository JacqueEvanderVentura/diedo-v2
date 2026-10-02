import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, UserRound, Users } from 'lucide-react'
import { useCrmStore } from '@/stores/crmStore'
import { useCustomersStore } from '@/stores/customersStore'
import { useSessionStore } from '@/stores/sessionStore'
import { customersVisibleToSession } from '@/lib/customerScope'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { filterQuoteParties, quotePartyLabel } from '@/modules/crm/lib/quoteParty'

export function QuotePartyPicker({
  value,
  onChange,
  branchId = null,
  disabled = false,
  testId = 'quote-party-picker',
}) {
  const leads = useCrmStore((s) => s.leads)
  const opportunities = useCrmStore((s) => s.opportunities)
  const customers = useCustomersStore((s) => s.customers)
  const user = useSessionStore((s) => s.user)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const scopedCustomers = useMemo(
    () => customersVisibleToSession(customers, user),
    [customers, user],
  )

  const options = useMemo(
    () => filterQuoteParties({
      query,
      leads,
      customers: scopedCustomers,
      branchId,
    }),
    [query, leads, scopedCustomers, branchId],
  )

  const displayName = value?.id
    ? quotePartyLabel(value, { leads, customers: scopedCustomers, opportunities })
    : 'Buscar lead o cliente…'

  useEffect(() => {
    if (!open) return
    const onClick = (event) => {
      if (btnRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const selectParty = (row) => {
    onChange?.({ type: row.type, id: row.id })
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative min-w-0">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        data-testid={`${testId}-trigger`}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors',
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-blue-200 hover:bg-blue-50/40',
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          {value?.type === 'lead' ? <UserRound className="h-4 w-4" /> : <Users className="h-4 w-4" />}
        </div>
        <p className={cn('min-w-0 flex-1 truncate text-sm font-medium', value?.id ? 'text-slate-800' : 'text-slate-500')}>
          {displayName}
        </p>
      </button>

      <DropdownPanel
        open={open}
        anchorRef={btnRef}
        menuRef={menuRef}
        align="start"
        estimatedHeight={360}
        zIndex={120}
        className="p-0"
        data-testid={`${testId}-menu`}
      >
        <div className="border-b border-slate-100 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar lead o cliente…"
              data-testid={`${testId}-search`}
              className="w-full rounded-lg border-0 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 ring-1 ring-inset ring-transparent placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1.5 scrollbar-thin">
          {options.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">Sin coincidencias</p>
          ) : (
            options.map((row) => (
              <button
                key={`${row.type}-${row.id}`}
                type="button"
                onClick={() => selectParty(row)}
                data-testid={`${testId}-option-${row.type}-${row.id}`}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-800">{row.title}</p>
                    <Badge tone={row.type === 'lead' ? 'brand' : 'neutral'} className="text-[10px]">
                      {row.badge}
                    </Badge>
                  </div>
                  {row.subtitle && <p className="text-xs text-slate-400">{row.subtitle}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownPanel>
    </div>
  )
}
