import { useState, useRef, useEffect, useMemo } from 'react'
import { Users, ChevronRight, Search, Check, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomersStore } from '@/stores/customersStore'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { customersAtBranch, customersVisibleToSession } from '@/lib/customerScope'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BranchMultiSelect } from '@/components/ui/BranchMultiSelect'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { truncateDisplayText } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/Select'
import {
  DOC_TYPES,
  formatDocumentInput,
  validateCustomerDocument,
  findCustomerByDocument,
  normalizeDocumentId,
} from '@/lib/customerDocuments'

const CUSTOMER_NAME_DISPLAY_MAX = 40

export function CustomerPicker({
  value,
  onChange,
  placeholder = 'Seleccionar cliente…',
  testIdPrefix = 'customer-picker',
  className,
  branchId = null,
  allowManualEntry = false,
  manualEntryLabel = 'Cliente manual (escribir datos)',
}) {
  const customers = useCustomersStore((s) => s.customers)
  const customersListMeta = useCustomersStore((s) => s.customersListMeta)
  const fetchCustomersPage = useCustomersStore((s) => s.fetchCustomersPage)
  const addCustomer = useCustomersStore((s) => s.addCustomer)
  const branches = useConfigStore((s) => s.branches)
  const user = useSessionStore((s) => s.user)
  const online = useSessionStore((s) => s.status === 'online')

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [docType, setDocType] = useState('cedula')
  const [documentId, setDocumentId] = useState('')
  const [branchIds, setBranchIds] = useState([])
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const selectedId = value?.id
  const rawName = value?.name?.trim()
  const displayName = rawName
    ? truncateDisplayText(rawName, CUSTOMER_NAME_DISPLAY_MAX)
    : placeholder
  const displayPhone = value?.phone

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (!modalOpen) return
    setBranchIds(branchId ? [branchId] : [])
  }, [modalOpen, branchId])

  useEffect(() => {
    if (!open || !online) return undefined
    const branchIds = branchId ? [branchId] : []
    const handle = window.setTimeout(() => {
      fetchCustomersPage({ page: 1, search: query.trim(), branchIds }).catch(() => {})
    }, query.trim() ? 400 : 0)
    return () => window.clearTimeout(handle)
  }, [open, online, query, branchId, fetchCustomersPage])

  const scopedCustomers = useMemo(
    () => customersVisibleToSession(customers, user),
    [customers, user]
  )
  const branchScopedCustomers = useMemo(
    () => customersAtBranch(scopedCustomers, branchId),
    [scopedCustomers, branchId]
  )

  const q = query.trim().toLowerCase()
  const filtered = branchScopedCustomers.filter((c) => {
    if (c.isDefault) return false
    if (!q) return true
    const docKey = normalizeDocumentId(q, 'cedula')
    return (
      c.name.toLowerCase().includes(q)
      || (c.phone && c.phone.includes(q))
      || (docKey && c.documentId && normalizeDocumentId(c.documentId, c.docType || 'cedula').includes(docKey))
    )
  })

  const selectCustomer = (c) => {
    onChange?.(c)
    setOpen(false)
    setQuery('')
  }

  const openCreate = () => {
    setOpen(false)
    setModalOpen(true)
  }

  const submitCreate = async () => {
    if (!name.trim()) return setErr('Ingresa el nombre del cliente.')
    if (!branchIds.length) return setErr('Selecciona al menos una sucursal.')
    const docErr = validateCustomerDocument(docType, documentId)
    if (docErr) return setErr(docErr)
    const duplicate = findCustomerByDocument(scopedCustomers, docType, documentId)
    if (duplicate) return setErr('Ya existe un cliente con ese documento.')
    setSaving(true)
    try {
      const customer = await addCustomer({
        name: name.trim(),
        phone: phone.trim() || null,
        docType,
        documentId: documentId.trim(),
        branchIds,
      })
      onChange?.(customer)
      toast.success(`Cliente "${customer.name}" creado y seleccionado`)
      setName('')
      setPhone('')
      setDocType('cedula')
      setDocumentId('')
      setBranchIds([])
      setErr('')
      setModalOpen(false)
    } catch (error) {
      setErr(error.message || 'No se pudo crear el cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn('relative min-w-0', className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={`${testIdPrefix}-trigger`}
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Users className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn('truncate text-sm font-semibold', value?.name ? 'text-slate-800' : 'text-slate-400')}
            title={rawName && rawName.length > CUSTOMER_NAME_DISPLAY_MAX ? rawName : undefined}
          >
            {displayName}
          </p>
          {displayPhone ? <p className="truncate text-xs text-slate-400">{displayPhone}</p> : null}
        </div>
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-90')} />
      </button>

      <DropdownPanel
        open={open}
        anchorRef={btnRef}
        menuRef={menuRef}
        align="start"
        estimatedHeight={320}
        zIndex={120}
        className="p-0"
        data-testid={`${testIdPrefix}-menu`}
      >
        {allowManualEntry && (
          <button
            type="button"
            onClick={() => {
              onChange?.(null)
              setOpen(false)
              setQuery('')
            }}
            data-testid={`${testIdPrefix}-manual`}
            className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors hover:bg-amber-50"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Users className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-amber-800">{manualEntryLabel}</span>
          </button>
        )}
        <button
          type="button"
          onClick={openCreate}
          data-testid={`${testIdPrefix}-create`}
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
              placeholder="Buscar por nombre, teléfono o cédula…"
              data-testid={`${testIdPrefix}-search`}
              className="w-full rounded-lg border-0 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 ring-1 ring-inset ring-transparent placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="max-h-52 overflow-y-auto p-1.5 scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">
              {online && open && customersListMeta.loading ? 'Buscando…' : 'Sin coincidencias'}
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCustomer(c)}
                data-testid={`${testIdPrefix}-option-${c.id}`}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium text-slate-800"
                    title={c.name.length > CUSTOMER_NAME_DISPLAY_MAX ? c.name : undefined}
                  >
                    {truncateDisplayText(c.name, CUSTOMER_NAME_DISPLAY_MAX)}
                  </p>
                  {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                </div>
                {selectedId === c.id && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            ))
          )}
        </div>
      </DropdownPanel>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo cliente"
        wide
        testId={`${testIdPrefix}-modal`}
      >
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
              data-testid={`${testIdPrefix}-new-name`}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Tipo de documento</label>
              <Select
                value={docType}
                onChange={setDocType}
                options={DOC_TYPES.map((item) => ({ value: item.id, label: item.label }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">Documento</label>
              <Input
                value={documentId}
                onChange={(e) => {
                  setDocumentId(formatDocumentInput(e.target.value, docType))
                  setErr('')
                }}
                placeholder={docType === 'cedula' ? '001-1234567-8' : docType === 'rnc' ? '123456789' : 'Pasaporte'}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Teléfono (opcional)</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="809-000-0000"
              data-testid={`${testIdPrefix}-new-phone`}
            />
          </div>
          <div>
            <div className="mb-2">
              <p className="text-sm font-medium text-slate-600">Sucursales asignadas</p>
              <p className="text-xs text-slate-400">
                El cliente podrá usarse en las sucursales que marques aquí.
              </p>
            </div>
            <BranchMultiSelect
              branches={branches}
              branchIds={branchIds}
              onChange={(ids) => {
                setBranchIds(ids)
                setErr('')
              }}
              showAllOption={false}
              className="w-full"
              testId={`${testIdPrefix}-new-branches`}
            />
          </div>
          {err && (
            <p className="text-sm font-medium text-red-500" data-testid={`${testIdPrefix}-new-error`}>
              {err}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)} data-testid={`${testIdPrefix}-new-cancel`}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={submitCreate} disabled={saving} data-testid={`${testIdPrefix}-new-save`}>
              {saving ? 'Creando…' : 'Crear y seleccionar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
