import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CalendarClock,
  CreditCard,
  Eye,
  FileText,
  LogOut,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { publicPortalApi } from '@/services/publicPortalApi'
import { publicBookingApi } from '@/services/publicBookingApi'
import { useSessionStore } from '@/stores/sessionStore'
import { formatDOP } from '@/lib/format'
import { fmtDate } from '@/modules/crm/lib/crm'
import { formatTime12h } from '@/modules/agenda/lib/calendar'
import { managementUrl } from '@/modules/agenda/lib/notification'
import { PublicShell } from '../components/PublicShell'
import { PortalInvoicePreviewModal } from '../components/PortalInvoicePreviewModal'
import { clearPublicSession, recallPublicSession } from '../lib/publicSession'
import { cn } from '@/lib/utils'

function appointmentStatusLabel(status) {
  if (status === 'cancelled') return 'Cancelada'
  if (status === 'confirmed') return 'Confirmada'
  return status
}

const TABS = [
  { id: 'citas', label: 'Citas', icon: CalendarClock },
  { id: 'facturas', label: 'Facturas', icon: FileText },
  { id: 'pagos', label: 'Pagos', icon: Wallet },
]

export default function PortalPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const branchId = params.get('branch') || recallPublicSession()?.branchId
  const session = recallPublicSession()
  const isDemo = useSessionStore((s) => s.status) === 'demo'
  const [tab, setTab] = useState('citas')
  const [profile, setProfile] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [receivables, setReceivables] = useState([])
  const [loading, setLoading] = useState(true)
  const [branchName, setBranchName] = useState('')
  const [cancellingId, setCancellingId] = useState(null)
  const [invoicePreview, setInvoicePreview] = useState(null)
  const [invoicePreviewLoading, setInvoicePreviewLoading] = useState(false)
  const [invoicePreviewError, setInvoicePreviewError] = useState('')

  useEffect(() => {
    if (!branchId || !session?.documentId) return
    if (isDemo) {
      setProfile({ displayName: 'Cliente demo', isNew: false })
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    Promise.all([
      publicBookingApi.getContext(branchId).catch(() => null),
      publicPortalApi.me(branchId, session),
      publicPortalApi.listAppointments(branchId, session),
      publicPortalApi.listInvoices(branchId, session),
      publicPortalApi.listReceivables(branchId, session),
    ])
      .then(([context, me, apts, invs, cxc]) => {
        if (!active) return
        setBranchName(context?.branch?.branchName || '')
        setProfile(me)
        setAppointments(apts.items || [])
        setInvoices(invs.items || [])
        setReceivables(cxc.items || [])
      })
      .catch(() => {
        if (active) toast.error('No se pudo cargar tu portal. Intenta iniciar sesión de nuevo.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [branchId, session?.documentId, isDemo])

  const workspaceName = profile?.displayName ? 'Mi cuenta' : 'Portal del cliente'

  if (!branchId) {
    return <Navigate to="/agendar" replace />
  }
  if (!session?.documentId) {
    return <Navigate to={`/agendar?branch=${branchId}`} replace />
  }

  const logout = () => {
    clearPublicSession()
    navigate(`/agendar?branch=${branchId}`)
  }

  const branchAppointments = useMemo(
    () => appointments.filter((apt) => String(apt.branchId || branchId) === String(branchId)),
    [appointments, branchId],
  )

  const closeInvoicePreview = () => {
    if (invoicePreview?.blobUrl) URL.revokeObjectURL(invoicePreview.blobUrl)
    setInvoicePreview(null)
    setInvoicePreviewError('')
    setInvoicePreviewLoading(false)
  }

  const openInvoicePreview = async (invoice) => {
    if (!session?.documentId) return
    setInvoicePreview({ saleNumber: invoice.saleNumber, blobUrl: null })
    setInvoicePreviewLoading(true)
    setInvoicePreviewError('')
    try {
      const blob = await publicPortalApi.fetchInvoicePdf(branchId, invoice.id, session)
      const blobUrl = URL.createObjectURL(blob)
      setInvoicePreview({ saleNumber: invoice.saleNumber, blobUrl })
    } catch (error) {
      const message = error?.message || 'No se pudo cargar la factura. Intenta de nuevo.'
      setInvoicePreviewError(message)
      toast.error(message)
    } finally {
      setInvoicePreviewLoading(false)
    }
  }

  const cancelAppointment = async (apt) => {
    const aptBranchId = apt.branchId || branchId
    if (!apt.managementToken) {
      toast.error('No se puede cancelar esta cita desde el portal.')
      return
    }
    if (!window.confirm('¿Cancelar esta cita y liberar el horario?')) return
    setCancellingId(apt.id)
    try {
      await publicBookingApi.cancelAppointment(aptBranchId, apt.id, {
        managementToken: apt.managementToken,
      })
      setAppointments((items) =>
        items.map((item) => (item.id === apt.id ? { ...item, status: 'cancelled' } : item)),
      )
      toast.success('Cita cancelada.')
    } catch (error) {
      toast.error(error.message || 'No se pudo cancelar la cita.')
    } finally {
      setCancellingId(null)
    }
  }

  const empty = useMemo(() => ({
    citas: branchAppointments.length === 0,
    facturas: invoices.length === 0,
    pagos: receivables.length === 0,
  }), [branchAppointments, invoices, receivables])

  return (
    <PublicShell
      branchName={branchName || 'Sucursal'}
      workspaceName={profile?.displayName || workspaceName}
      footer={
        <Button variant="ghost" size="sm" onClick={logout} data-testid="portal-logout">
          <LogOut className="h-4 w-4" /> Salir
        </Button>
      }
    >
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/agendar?branch=${branchId}&intent=book`}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            data-testid="portal-book-cta"
          >
            Agendar nueva cita
          </Link>
        </div>

        <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-soft">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold whitespace-nowrap',
                tab === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </nav>

        {loading ? (
          <p className="text-center text-sm text-slate-500">Cargando…</p>
        ) : (
          <>
            {tab === 'citas' && (
              <Section empty={empty.citas} emptyLabel="Aún no tienes citas. Agenda tu primera visita.">
                <ul className="space-y-2">
                  {branchAppointments.map((apt) => {
                    const canManage = apt.status === 'confirmed' && apt.managementToken
                    const aptBranchId = apt.branchId || branchId
                    return (
                      <li key={apt.id} className="rounded-xl border border-slate-100 bg-white p-4 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{apt.serviceName}</p>
                            <p className="text-slate-500">
                              {fmtDate(apt.date)} · {formatTime12h(apt.time)}
                            </p>
                          </div>
                          <Badge tone={apt.status === 'cancelled' ? 'neutral' : 'success'}>
                            {appointmentStatusLabel(apt.status)}
                          </Badge>
                        </div>
                        {canManage ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link
                              to={managementUrl(aptBranchId, apt)}
                              className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                              data-testid={`portal-apt-edit-${apt.id}`}
                            >
                              Cambiar horario
                            </Link>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="flex-1 text-xs"
                              disabled={cancellingId === apt.id}
                              onClick={() => cancelAppointment(apt)}
                              data-testid={`portal-apt-cancel-${apt.id}`}
                            >
                              {cancellingId === apt.id ? 'Cancelando…' : 'Cancelar cita'}
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </Section>
            )}
            {tab === 'facturas' && (
              <Section empty={empty.facturas} emptyLabel="No hay facturas disponibles.">
                <ul className="space-y-2">
                  {invoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 text-sm">
                      <div>
                        <p className="font-semibold text-slate-900">{inv.saleNumber}</p>
                        <p className="text-slate-500">{formatDOP(inv.total)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openInvoicePreview(inv)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        aria-label={`Ver factura ${inv.saleNumber}`}
                        data-testid={`portal-invoice-view-${inv.id}`}
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {tab === 'pagos' && (
              <Section empty={empty.pagos} emptyLabel="No hay pagos registrados a tu nombre.">
                <ul className="space-y-2">
                  {receivables.map((row) => {
                    const balance = Number(row.balance ?? 0)
                    const showBalance = balance > 0
                    return (
                    <li key={row.id} className="rounded-xl border border-slate-100 bg-white p-4 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{row.receivableNumber}</p>
                          {showBalance ? (
                            <p className="text-slate-500">Saldo: {formatDOP(row.balance)}</p>
                          ) : null}
                        </div>
                        <Badge>{row.status}</Badge>
                      </div>
                      {row.dueDate ? <p className="mt-1 text-xs text-slate-400">Vence: {fmtDate(row.dueDate)}</p> : null}
                    </li>
                    )
                  })}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
      <PortalInvoicePreviewModal
        open={invoicePreview !== null}
        onClose={closeInvoicePreview}
        saleNumber={invoicePreview?.saleNumber}
        pdfUrl={invoicePreview?.blobUrl}
        loading={invoicePreviewLoading}
        error={invoicePreviewError}
      />
    </PublicShell>
  )
}

function Section({ empty, emptyLabel, children }) {
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">
        <CreditCard className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        {emptyLabel}
      </div>
    )
  }
  return children
}
