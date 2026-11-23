import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { NotificationList } from '@/components/notifications/NotificationList'
import { useNotificationPageSize } from '@/hooks/useNotificationPageSize'
import { openNotificationLink } from '@/lib/notificationNavigation'
import { useIncidenciasStore } from '@/stores/incidenciasStore'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { useSessionStore } from '@/stores/sessionStore'

const LIST_PAGE_SIZE = 10

export default function NotificationsPage() {
  const navigate = useNavigate()
  const pageSize = useNotificationPageSize()
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
        // ignore
      }
    }
    openNotificationLink({ notification: n, navigate, setIncidenciaId: setSelectedId })
  }

  return (
    <PageShell title="Mis notificaciones" subtitle="Historial de avisos de tu cuenta (hasta 50).">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {unreadCount > 0
              ? `${unreadCount} sin leer`
              : 'Estás al día con tus notificaciones.'}
          </p>
          {unreadCount > 0 && isOnline && (
            <button
              type="button"
              onClick={async () => {
                await markAllRead()
                await loadPage(page)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
            >
              <CheckCheck className="h-4 w-4" />
              He leído todo
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          {loading && items.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-slate-400">Cargando…</p>
          ) : (
            <NotificationList
              items={items}
              onOpen={openNotification}
              page={page}
              pageSize={LIST_PAGE_SIZE}
              total={total}
              onPageChange={loadPage}
            />
          )}
        </div>

        <p className="mt-3 text-center text-xs text-slate-400">
          Vista rápida en la campana: {pageSize} por página según el tamaño de pantalla.
        </p>
      </div>
    </PageShell>
  )
}