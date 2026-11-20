import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCustomersStore } from '@/stores/customersStore'
import { cn } from '@/lib/utils'

const MATCH_LABELS = {
  document: 'Cédula / documento',
  phone: 'Teléfono',
  email: 'Correo',
  name: 'Nombre',
}

const MATCH_TONES = {
  document: 'brand',
  phone: 'warning',
  email: 'neutral',
  name: 'neutral',
}

function customerPhones(customer) {
  return [customer.phone, customer.phone2, customer.phone3].filter((value) => (value || '').trim())
}

function distinctNonEmpty(values) {
  const seen = new Set()
  for (const value of values) {
    const trimmed = (value || '').trim()
    if (!trimmed) continue
    seen.add(trimmed.toLowerCase())
  }
  return seen.size
}

function nameGroupNeedsHomonymWarning(group) {
  if (group.matchType !== 'name') return false
  const customers = group.customers || []
  if (customers.length < 2) return false
  const phonesDiffer = distinctNonEmpty(customers.flatMap(customerPhones)) > 1
  const emailsDiffer = distinctNonEmpty(customers.map((c) => c.email)) > 1
  return phonesDiffer || emailsDiffer
}

function formatCustomerContact(customer) {
  const phones = customerPhones(customer).join(' · ')
  const bits = [customer.documentId, phones, customer.email].filter(Boolean)
  return bits.join(' · ') || 'Sin contacto extra'
}

function groupStableKey(group) {
  const ids = [...(group.customers || []).map((customer) => customer.id)].sort().join('|')
  return `${group.matchType}:${group.matchValue}:${ids}`
}

export function DuplicateCustomersModal({ open, onClose, onMerged }) {
  const fetchDuplicateCustomers = useCustomersStore((s) => s.fetchDuplicateCustomers)
  const mergeDuplicateCustomers = useCustomersStore((s) => s.mergeDuplicateCustomers)
  const autoMergeDuplicateCustomers = useCustomersStore((s) => s.autoMergeDuplicateCustomers)

  const [loading, setLoading] = useState(false)
  const [autoMergeBusy, setAutoMergeBusy] = useState(false)
  const [mergingGroupKey, setMergingGroupKey] = useState(null)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState([])
  const [keepByGroup, setKeepByGroup] = useState({})
  const [selectedByGroup, setSelectedByGroup] = useState({})

  const loadGroups = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetchDuplicateCustomers()
      const nextGroups = response.groups || []
      setGroups(nextGroups)
      const keep = {}
      const selected = {}
      nextGroups.forEach((group) => {
        const key = groupStableKey(group)
        const ids = group.customers.map((customer) => customer.id)
        keep[key] = ids[0]
        selected[key] = new Set(ids)
      })
      setKeepByGroup(keep)
      setSelectedByGroup(selected)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los duplicados.')
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadGroups()
  }, [open])

  const totalCustomers = useMemo(
    () => new Set(groups.flatMap((group) => group.customers.map((customer) => customer.id))).size,
    [groups],
  )

  const toggleMember = (key, customerId) => {
    setSelectedByGroup((current) => {
      const next = new Set(current[key] || [])
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return { ...current, [key]: next }
    })
  }

  const runManualMerge = async (group) => {
    const key = groupStableKey(group)
    const keepCustomerId = keepByGroup[key]
    const selected = [...(selectedByGroup[key] || [])]
    if (!selected.includes(keepCustomerId)) selected.push(keepCustomerId)
    if (selected.length < 2) {
      toast.error('Elige al menos dos clientes para combinar.')
      return
    }
    if (mergingGroupKey === key) return
    setMergingGroupKey(key)
    try {
      await mergeDuplicateCustomers({ customerIds: selected, keepCustomerId })
      toast.success('Clientes combinados')
      onMerged?.()
      setGroups((current) => current.filter((item) => groupStableKey(item) !== key))
      setKeepByGroup((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setSelectedByGroup((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    } catch (err) {
      toast.error(err.message || 'No se pudieron combinar los clientes.')
    } finally {
      setMergingGroupKey(null)
    }
  }

  const runAutoMerge = async () => {
    setAutoMergeBusy(true)
    try {
      const result = await autoMergeDuplicateCustomers()
      const archived = result.archivedCustomers || 0
      if (!archived) {
        const blocked = groups.filter(
          (g) => g.matchType === 'name' && nameGroupNeedsHomonymWarning(g),
        ).length
        if (groups.length > 0 && blocked > 0) {
          toast.message(
            `No se combinaron grupos automáticamente. ${blocked} grupo(s) por nombre tienen correos distintos; revísalos con «Combinar grupo».`,
          )
        } else if (groups.length > 0) {
          toast.message('No quedaban grupos listos para combinar automáticamente en este paso.')
        } else {
          toast.message('No había grupos para combinar automáticamente.')
        }
      } else {
        toast.success(`Se combinaron ${result.mergedGroups} grupo(s) (${archived} archivados).`)
      }
      onMerged?.()
      await loadGroups()
    } catch (err) {
      toast.error(err.message || 'No se pudo completar el combinado automático.')
    } finally {
      setAutoMergeBusy(false)
    }
  }

  const modalBusy = autoMergeBusy

  return (
    <Modal
      open={open}
      onClose={modalBusy ? undefined : onClose}
      title="Clientes duplicados"
      testId="clientes-duplicates-modal"
      xlarge
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Se agrupan coincidencias por cédula, teléfono, correo y nombre exacto. El combinado
          automático incluye nombre si no hay correos distintos y conserva hasta 3 teléfonos al
          fusionar.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-500">
            {loading ? 'Buscando coincidencias…' : `${groups.length} grupo(s) · ${totalCustomers} cliente(s)`}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={runAutoMerge}
            disabled={modalBusy || loading || groups.length === 0}
            data-testid="clientes-duplicates-auto-merge"
            aria-busy={modalBusy}
          >
            {modalBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" data-testid="clientes-duplicates-auto-merge-spinner" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {modalBusy ? 'Combinando…' : 'Combinar automáticamente'}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">Cargando duplicados…</p>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Copy}
            title="Sin duplicados"
            description="No hay clientes activos que compartan cédula, teléfono, correo o nombre."
            className="py-10"
          />
        ) : (
          <div className="space-y-4">
            {groups.map((group, index) => {
              const key = groupStableKey(group)
              const selected = selectedByGroup[key] || new Set()
              const groupMerging = mergingGroupKey === key
              return (
                <div
                  key={key}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                  data-testid={`clientes-duplicates-group-${index}`}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={MATCH_TONES[group.matchType] || 'neutral'}>
                        {MATCH_LABELS[group.matchType] || group.matchType}
                      </Badge>
                      <span className="text-sm font-semibold text-slate-800">{group.matchValue}</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => runManualMerge(group)}
                      disabled={groupMerging}
                      data-testid={`clientes-duplicates-merge-${index}`}
                    >
                      {groupMerging ? 'Combinando…' : 'Combinar grupo'}
                    </Button>
                  </div>
                  {nameGroupNeedsHomonymWarning(group) ? (
                    <p
                      className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                      data-testid={`clientes-duplicates-homonym-warning-${index}`}
                    >
                      Mismo nombre, pero teléfono o correo distintos. Al combinar manualmente se
                      conservan hasta 3 teléfonos. Confirma que no son personas diferentes.
                    </p>
                  ) : null}
                  <ul className="space-y-2">
                    {group.customers.map((customer) => {
                      const checked = selected.has(customer.id)
                      const isKeep = keepByGroup[key] === customer.id
                      return (
                        <li
                          key={customer.id}
                          className={cn(
                            'flex flex-col gap-2 rounded-lg bg-white p-3 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between',
                            isKeep && 'ring-blue-300',
                          )}
                        >
                          <label className="flex min-w-0 cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={() => toggleMember(key, customer.id)}
                              disabled={groupMerging || isKeep}
                            />
                            <span className="min-w-0">
                              <span className="block font-semibold text-slate-800">{customer.displayName}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">
                                {formatCustomerContact(customer)}
                              </span>
                            </span>
                          </label>
                          <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-600">
                            <input
                              type="radio"
                              name={`keep-${key}`}
                              checked={isKeep}
                              onChange={() => {
                                setKeepByGroup((current) => ({ ...current, [key]: customer.id }))
                                setSelectedByGroup((current) => {
                                  const next = new Set(current[key] || [])
                                  next.add(customer.id)
                                  return { ...current, [key]: next }
                                })
                              }}
                              disabled={groupMerging}
                            />
                            Conservar
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
