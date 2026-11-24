import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { ResumeBookingWhatsAppButton } from '@/components/notifications/ResumeBookingWhatsAppButton'
import { Button } from '@/components/ui/Button'
import {
  MobileCard,
  MobileCardFooter,
  MobileCardHeader,
  MobileField,
  ResponsiveCards,
  ResponsiveList,
  ResponsiveTable,
} from '@/components/ui/ResponsiveList'
import { formatLocaleDateTime12h } from '@/lib/format'
import { openNotificationLink } from '@/lib/notificationNavigation'
import { canSendResumeBookingWhatsApp } from '@/modules/agenda/lib/slotHoldWhatsApp'
import { useIncidenciasStore } from '@/stores/incidenciasStore'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { useSessionStore } from '@/stores/sessionStore'

const LIST_PAGE_SIZE = 10
const WHEN_OPTIONS = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }

function fmtWhen(iso) {
  try {
    return formatLocaleDateTime12h(iso, WHEN_OPTIONS)
  } catch {
    return '—'
  }
}

function hasLink(n) {
  return Boolean(n.link?.path || n.link?.incidentId || n.link?.incidenciaId)
}

function StatusBadge({ read }) {
  return read ? <Badge tone="neutral">Leída</Badge> : <Badge tone="brand">Nueva</Badge>
}

// Rendered inside the layout `PageShell` route (navbar + scroll container are provided there).
export default function NotificationsPage() {
  const navigate = useNavigate()
  const isOnline = useSessionStore((s) => s.status === 'online')

  const items = useNotificationsStore((s) => s.items)
  const page = useNotificationsStore((s) => s.page)
  const total = useNotificationsStore((s) => s.total)
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const loading = useNotificationsStore((s) => s.loading)
  const fetchNotifications = useNotificationsStore((s) => s.fetch)
  const markRead = useNotificationsStore((s) => s.markRead)
  const markAllRead = useNotificationsStore((s) => s.markAllRead)
  const setSelectedId = useIncidenciasStore((s) => s.setSelectedId)

  const loadPage = useCallback(
    (nextPage = 1) => {
      if (!isOnline) return
      return fetchNotifications({ page: nextPage, pageSize: LIST_PAGE_SIZE })
    },
    [fetchNotifications, isOnline]
  )

  useEffect(() => {
    loadPage(1)
  }, [loadPage])

  const openNotification = async (n) => {
    if (isOnline && !n.read) {
      try {
        await markRead(n.id)
      } catch {
        // ignore: navigation should proceed even if mark-read fails
      }
    }
    openNotificationLink({ notification: n, navigate, setIncidenciaId: setSelectedId })
  }

  const markOneRead = async (n) => {
    try {
      await markRead(n.id)
    } catch {
      // ignore
    }
  }

  const totalPages = total ? Math.ceil(total / LIST_PAGE_SIZE) : 1
  const rangeFrom = total ? (page - 1) * LIST_PAGE_SIZE + 1 : 0
  const rangeTo = Math.min(page * LIST_PAGE_SIZE, total)
  const isInitialLoad = loading && items.length === 0
  const isEmpty = !loading && items.length === 0

  const renderPrimaryAction = (n) => {
    if (hasLink(n)) {
      return (
        <Button variant="secondary" size="sm" onClick={() => openNotification(n)}>
          Abrir
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )
    }
    if (!n.read && isOnline) {
      return (
        <Button variant="secondary" size="sm" onClick={() => markOneRead(n)}>
          Marcar leída
        </Button>
      )
    }
    return null
  }

  const renderAction = (n) => {
    const primary = renderPrimaryAction(n)
    if (!canSendResumeBookingWhatsApp(n)) return primary
    return (
      <div className="flex flex-col items-end gap-2">
        {primary}
        <ResumeBookingWhatsAppButton notification={n} />
      </div>
    )
  }

  return (
    <div className="w-full p-6 sm:p-8" data-testid="notifications-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>
            <span className="font-semibold text-slate-900">{total}</span> registros
          </span>
          {unreadCount > 0 && <Badge tone="brand">{unreadCount} sin leer</Badge>}
        </div>
        {unreadCount > 0 && isOnline && (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await markAllRead()
              await loadPage(page)
            }}
          >
            <CheckCheck className="h-4 w-4" />
            He leído todo
          </Button>
        )}
      </div>

      <ResponsiveList columnCount={4}>
        <ResponsiveTable testId="notifications-log">
          <table className="w-full text-sm" data-testid="notifications-log-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="w-28 px-4 py-3">Estado</th>
                <th className="w-48 px-4 py-3">Fecha y hora</th>
                <th className="px-4 py-3">Aviso</th>
                <th className="w-36 px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoad && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">Cargando…</td>
                </tr>
              )}
              {isEmpty && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">
                    No tienes notificaciones.
                  </td>
                </tr>
              )}
              {items.map((n) => (
                <tr
                  key={n.id}
                  data-testid={`notification-row-${n.id}`}
                  className={n.read ? 'border-b border-slate-50' : 'border-b border-slate-50 bg-blue-50/40'}
                >
                  <td className="px-4 py-3 align-top">
                    <StatusBadge read={n.read} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-xs tabular-nums text-slate-500">
                    {fmtWhen(n.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <p className={n.read ? 'font-medium text-slate-800' : 'font-semibold text-slate-900'}>{n.title}</p>
                    {n.body && <p className="mt-0.5 text-slate-500">{n.body}</p>}
                  </td>
                  <td className="px-4 py-3 text-right align-top">{renderAction(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>

        <ResponsiveCards testId="notifications-log-cards">
          {isInitialLoad && <p className="py-12 text-center text-sm text-slate-400">Cargando…</p>}
          {isEmpty && <p className="py-12 text-center text-sm text-slate-400">No tienes notificaciones.</p>}
          {items.map((n) => (
            <MobileCard key={n.id} testId={`notification-card-${n.id}`} className={n.read ? undefined : 'bg-blue-50/40'}>
              <MobileCardHeader title={n.title} badge={<StatusBadge read={n.read} />} />
              {n.body && <p className="mt-2 text-sm text-slate-500">{n.body}</p>}
              <MobileCardFooter>
                <MobileField label="Fecha">
                  <span className="font-mono text-xs tabular-nums">{fmtWhen(n.createdAt)}</span>
                </MobileField>
                {renderAction(n)}
              </MobileCardFooter>
            </MobileCard>
          ))}
        </ResponsiveCards>
      </ResponsiveList>

      {total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <span>Mostrando {rangeFrom}–{rangeTo} de {total}</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => loadPage(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Anterior
            </Button>
            <span className="text-xs tabular-nums text-slate-500">{page} / {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => loadPage(page + 1)}>
              Siguiente
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
