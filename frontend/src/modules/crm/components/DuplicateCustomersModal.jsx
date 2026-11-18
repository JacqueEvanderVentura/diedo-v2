import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
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
}

const MATCH_TONES = {
  document: 'brand',
  phone: 'warning',
  email: 'neutral',
}

function groupKey(group, index) {
  return `${group.matchType}:${group.matchValue}:${index}`
}

export function DuplicateCustomersModal({ open, onClose, onMerged }) {
  const fetchDuplicateCustomers = useCustomersStore((s) => s.fetchDuplicateCustomers)
  const mergeDuplicateCustomers = useCustomersStore((s) => s.mergeDuplicateCustomers)
  const autoMergeDuplicateCustomers = useCustomersStore((s) => s.autoMergeDuplicateCustomers)

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
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
      nextGroups.forEach((group, index) => {
        const key = groupKey(group, index)
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

  const runManualMerge = async (group, index) => {
    const key = groupKey(group, index)
    const keepCustomerId = keepByGroup[key]
    const selected = [...(selectedByGroup[key] || [])]
    if (!selected.includes(keepCustomerId)) selected.push(keepCustomerId)
    if (selected.length < 2) {
      toast.error('Elige al menos dos clientes para combinar.')
      return
    }
    setBusy(true)
    try {
      await mergeDuplicateCustomers({ customerIds: selected, keepCustomerId })
      toast.success('Clientes combinados')
      onMerged?.()
      await loadGroups()
    } catch (err) {
      toast.error(err.message || 'No se pudieron combinar los clientes.')
    } finally {
      setBusy(false)
    }
  }

  const runAutoMerge = async () => {
    setBusy(true)
    try {
      const result = await autoMergeDuplicateCustomers()
      const archived = result.archivedCustomers || 0
      if (!archived) toast.message('No había grupos para combinar automáticamente.')
      else toast.success(`Se combinaron ${result.mergedGroups} grupo(s) (${archived} archivados).`)
      onMerged?.()
      await loadGroups()
    } catch (err) {
      toast.error(err.message || 'No se pudo completar el combinado automático.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Clientes duplicados"
      testId="clientes-duplicates-modal"
      xlarge
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Se agrupan coincidencias por cédula, luego teléfono y luego correo. El combinado automático
          usa ese mismo orden y conserva la ficha más completa.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-500">
            {loading ? 'Buscando coincidencias…' : `${groups.length} grupo(s) · ${totalCustomers} cliente(s)`}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={runAutoMerge}
            disabled={busy || loading || groups.length === 0}
            data-testid="clientes-duplicates-auto-merge"
          >
            <Copy className="h-4 w-4" />
            Combinar automáticamente
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">Cargando duplicados…</p>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Copy}
            title="Sin duplicados"
            description="No hay clientes activos que compartan cédula, teléfono o correo."
            className="py-10"
          />
        ) : (
          <div className="space-y-4">
            {groups.map((group, index) => {
              const key = groupKey(group, index)
              const selected = selectedByGroup[key] || new Set()
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
                      onClick={() => runManualMerge(group, index)}
                      disabled={busy}
                      data-testid={`clientes-duplicates-merge-${index}`}
                    >
                      Combinar grupo
                    </Button>
                  </div>
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
                              disabled={busy || isKeep}
                            />
                            <span className="min-w-0">
                              <span className="block font-semibold text-slate-800">{customer.displayName}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">
                                {[customer.documentId, customer.phone, customer.email].filter(Boolean).join(' · ') || 'Sin contacto extra'}
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
                              disabled={busy}
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
