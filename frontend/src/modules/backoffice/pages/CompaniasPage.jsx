import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Search } from 'lucide-react'
import { backofficeApi } from '@/services/backofficeApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { BackofficeSelect as Select } from '../components/BackofficeSelect'
import {
  ResponsiveList,
  ResponsiveTable,
  ResponsiveCards,
  MobileCard,
  MobileField,
  MobileCardHeader,
  MobileCardFooter,
} from '@/components/ui/ResponsiveList'
import { SortableTableProvider, SortableTh } from '@/components/ui/SortableTable'
import { useSortedRows } from '@/hooks/useTableControls'
import { EmptyState } from '@/components/ui/EmptyState'
import { newPasswordError } from '@/lib/passwordPolicy'

const STATUS_TONE = {
  active: 'success',
  suspended: 'warning',
  onboarding: 'neutral',
}

function statusLabel(status) {
  if (status === 'active') return 'Activa'
  if (status === 'suspended') return 'Suspendida'
  return status
}

const emptyForm = () => ({
  slug: '',
  name: '',
  defaultCurrency: 'DOP',
  timezone: 'America/Santo_Domingo',
  locale: 'es-DO',
  taxDefaultRate: '18',
  ownerEmail: '',
  ownerName: '',
  ownerPassword: '',
  identityMode: 'new',
  planCode: 'completo',
})

function mapWorkspace(item) {
  return {
    id: item.workspaceId,
    slug: item.slug,
    name: item.name,
    status: item.status,
    ownerEmail: item.owner?.email || '—',
    ownerName: item.owner?.displayName || '—',
    branchCount: item.branchCount ?? 0,
    planLabel: item.planLabel || item.planName || '—',
    createdAt: item.createdAt,
  }
}

export default function CompaniasPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [plans, setPlans] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, planData] = await Promise.all([
        backofficeApi.listWorkspaces(),
        backofficeApi.listPlans(),
      ])
      setRows((data.items || []).map(mapWorkspace))
      setPlans(planData.items || [])
    } catch (err) {
      toast.error(err.message || 'No se pudieron cargar las compañías.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const candidates = statusFilter ? rows.filter((row) => row.status === statusFilter) : rows
    if (!q) return candidates
    return candidates.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.slug.toLowerCase().includes(q) ||
        row.ownerEmail.toLowerCase().includes(q)
    )
  }, [query, rows, statusFilter])

  const {
    rows: sorted,
    sortKey,
    sortDir,
    toggleSort,
  } = useSortedRows(filtered, {
    defaultSort: { key: 'name', dir: 'asc' },
  })

  const submitCreate = async (event) => {
    event.preventDefault()
    const passwordError = form.identityMode === 'new' ? newPasswordError(form.ownerPassword) : null
    if (passwordError) {
      toast.error(passwordError)
      return
    }
    setSaving(true)
    try {
      const created = await backofficeApi.createWorkspace({
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        defaultCurrency: form.defaultCurrency.trim().toUpperCase(),
        timezone: form.timezone.trim(),
        locale: form.locale.trim(),
        taxDefaultRate: form.taxDefaultRate.trim(),
        planCode: form.planCode,
        owner: {
          email: form.ownerEmail.trim(),
          displayName: form.identityMode === 'new' ? form.ownerName.trim() : form.ownerEmail.trim(),
          ...(form.identityMode === 'new' ? { password: form.ownerPassword } : {}),
        },
      })
      toast.success('Compañía creada')
      setModalOpen(false)
      setForm(emptyForm())
      await load()
      navigate(`/backoffice/companias/${created.workspaceId}`)
    } catch (err) {
      toast.error(err.message || 'No se pudo crear la compañía.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6 sm:p-8" data-testid="backoffice-companias-page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold text-slate-900">Compañías</h2>
          <p className="mt-1 text-sm text-slate-600">Workspaces de clientes en la plataforma.</p>
        </div>
        <Button type="button" onClick={() => setModalOpen(true)} data-testid="companias-create">
          <Plus className="mr-2 h-4 w-4" />
          Nueva compañía
        </Button>
      </div>

      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, slug o owner…"
            className="pl-9"
            data-testid="companias-search"
          />
        </div>
      </Card>

      <label className="mb-4 block max-w-xs text-sm">
        Estado de compañía
        <Select
          value={statusFilter}
          onChange={(e) => setSearchParams(e.target.value ? { status: e.target.value } : {})}
        >
          <option value="">Todas</option>
          <option value="active">Activas</option>
          <option value="suspended">Suspendidas</option>
        </Select>
      </label>
      {loading ? (
        <Card className="p-8 text-sm text-slate-500">Cargando compañías…</Card>
      ) : sorted.length === 0 ? (
        <EmptyState title="Sin compañías" description="Crea la primera compañía para un cliente." />
      ) : (
        <SortableTableProvider sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>
          <ResponsiveList>
            <ResponsiveTable>
              <thead>
                <tr>
                  <SortableTh column="name">Compañía</SortableTh>
                  <SortableTh column="slug">Slug</SortableTh>
                  <SortableTh column="ownerEmail">Owner</SortableTh>
                  <SortableTh column="planLabel">Plan</SortableTh>
                  <SortableTh column="status">Estado</SortableTh>
                  <th className="text-right">Sucursales</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/backoffice/companias/${row.id}`)}
                  >
                    <td className="font-medium text-slate-900">
                      <Link to={`/backoffice/companias/${row.id}`} className="hover:text-blue-600">
                        {row.name}
                      </Link>
                    </td>
                    <td className="font-mono text-sm text-slate-600">{row.slug}</td>
                    <td>
                      <div className="text-sm text-slate-900">{row.ownerName}</div>
                      <div className="text-xs text-slate-500">{row.ownerEmail}</div>
                    </td>
                    <td className="text-sm text-slate-600">{row.planLabel}</td>
                    <td>
                      <Badge tone={STATUS_TONE[row.status] || 'neutral'}>
                        {statusLabel(row.status)}
                      </Badge>
                    </td>
                    <td className="text-right text-sm text-slate-600">{row.branchCount}</td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
            <ResponsiveCards>
              {sorted.map((row) => (
                <MobileCard
                  key={row.id}
                  onClick={() => navigate(`/backoffice/companias/${row.id}`)}
                >
                  <MobileCardHeader title={row.name} subtitle={row.slug} />
                  <MobileField label="Owner" value={`${row.ownerName} · ${row.ownerEmail}`} />
                  <MobileField label="Estado" value={statusLabel(row.status)} />
                  <MobileCardFooter>
                    <Badge tone={STATUS_TONE[row.status] || 'neutral'}>
                      {statusLabel(row.status)}
                    </Badge>
                  </MobileCardFooter>
                </MobileCard>
              ))}
            </ResponsiveCards>
          </ResponsiveList>
        </SortableTableProvider>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva compañía" wide>
        <form onSubmit={submitCreate} className="space-y-4">
          <label className="block text-sm">
            Tipo de cuenta del propietario
            <Select
              value={form.identityMode}
              onChange={(e) =>
                setForm({ ...form, identityMode: e.target.value, ownerPassword: '' })
              }
            >
              <option value="new">Cuenta nueva</option>
              <option value="existing">Cuenta existente</option>
            </Select>
          </label>
          {form.identityMode === 'existing' && (
            <p className="text-sm text-slate-500">
              Indica el correo de la cuenta existente. Su nombre y contraseña se conservan.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Nombre</label>
              <Input
                aria-label="Nombre de compañía"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Slug</label>
              <Input
                aria-label="Slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Moneda</label>
              <Input
                value={form.defaultCurrency}
                onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Zona horaria</label>
              <Input
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Plan</label>
              <Select
                aria-label="Plan de la compañía"
                value={form.planCode}
                onChange={(e) => setForm({ ...form, planCode: e.target.value })}
              >
                {plans.map((plan) => (
                  <option key={plan.planId} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">
              Usuario administrador (owner)
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Nombre</label>
                <Input
                  aria-label="Nombre del propietario"
                  disabled={form.identityMode === 'existing'}
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">Email</label>
                <Input
                  type="email"
                  aria-label="Email del propietario"
                  value={form.ownerEmail}
                  onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-600">
                  Contraseña inicial
                </label>
                <Input
                  type="password"
                  aria-label="Contraseña inicial"
                  value={form.ownerPassword}
                  disabled={form.identityMode === 'existing'}
                  onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creando…' : 'Crear compañía'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
