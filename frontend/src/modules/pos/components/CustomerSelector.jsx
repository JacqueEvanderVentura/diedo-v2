import { useState, useRef, useEffect } from 'react'
import { Users, ChevronRight, Search, Check, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { usePosStore } from '@/stores/posStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { cn } from '@/lib/utils'

const genId = () => `cust-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

export function CustomerSelector() {
  const customer = usePosStore((s) => s.customer)
  const setCustomer = usePosStore((s) => s.setCustomer)
  const customers = usePosStore((s) => s.customers)
  const addCustomer = usePosStore((s) => s.addCustomer)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const filtered = customers.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))

  const openCreate = () => {
    setOpen(false)
    setModalOpen(true)
  }

  const submitCreate = () => {
    if (!name.trim()) return setErr('Ingresa el nombre del cliente.')
    const c = { id: genId(), name: name.trim(), phone: phone.trim() || null }
    addCustomer(c) // also sets as current customer
    toast.success(`Cliente "${c.name}" creado y seleccionado`)
    setName('')
    setPhone('')
    setErr('')
    setModalOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
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

      <DropdownPanel
        open={open}
        anchorRef={btnRef}
        menuRef={menuRef}
        align="start"
        estimatedHeight={320}
        zIndex={40}
        className="p-0"
      >
        <button
          onClick={openCreate}
          data-testid="pos-customer-create"
          className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors hover:bg-blue-50"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <UserPlus className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-blue-700">Crear nuevo cliente</span>
        </button>

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
        <div className="max-h-52 overflow-y-auto scrollbar-thin p-1.5">
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
      </DropdownPanel>

      {/* Create customer modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo cliente" testId="pos-customer-modal">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Nombre</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setErr('')
              }}
              placeholder="Ej. Juan Pérez"
              data-testid="new-customer-name"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono (opcional)</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="809-000-0000" data-testid="new-customer-phone" />
          </div>
          {err && (
            <p className="text-sm font-medium text-red-500" data-testid="new-customer-error">
              {err}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)} data-testid="new-customer-cancel">
              Cancelar
            </Button>
            <Button className="flex-1" onClick={submitCreate} data-testid="new-customer-save">
              Crear y seleccionar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
