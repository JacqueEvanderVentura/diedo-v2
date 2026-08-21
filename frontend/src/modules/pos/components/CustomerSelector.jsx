import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Users, ChevronRight, Search, Check } from 'lucide-react'
import { CUSTOMERS } from '@/data/customers'
import { usePosStore } from '@/stores/posStore'
import { cn } from '@/lib/utils'

export function CustomerSelector() {
  const customer = usePosStore((s) => s.customer)
  const setCustomer = usePosStore((s) => s.setCustomer)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = CUSTOMERS.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid="pos-customer-selector"
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Users className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{customer.name}</p>
          {customer.phone && <p className="truncate text-xs text-slate-400">{customer.phone}</p>}
        </div>
        <ChevronRight className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-90')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl"
          >
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar cliente..."
                  data-testid="pos-customer-search"
                  className="w-full rounded-lg border-0 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 ring-1 ring-inset ring-transparent placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto scrollbar-thin p-1.5">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-slate-400">Sin coincidencias</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomer(c)
                      setOpen(false)
                      setQuery('')
                    }}
                    data-testid={`pos-customer-option-${c.id}`}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                      {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                    </div>
                    {customer.id === c.id && <Check className="h-4 w-4 text-blue-600" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
