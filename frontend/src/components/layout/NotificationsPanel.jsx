import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { NotificationList } from '@/components/notifications/NotificationList'
import { DropdownPanel } from '@/components/ui/DropdownPanel'
import { useNotificationPageSize } from '@/hooks/useNotificationPageSize'
import { openNotificationLink } from '@/lib/notificationNavigation'
import { useIncidenciasStore } from '@/stores/incidenciasStore'
import { useNotificationsStore } from '@/stores/notificationsStore'
import { useSessionStore } from '@/stores/sessionStore'

export function NotificationsPanel() {
  const navigate = useNavigate()
  const anchorRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const pageSize = useNotificationPageSize()

  const items = useNotificationsStore((s) => s.items)
  const page = useNotificationsStore((s) => s.page)
  const total = useNotificationsStore((s) => s.total)
  const unreadCount = useNotificationsStore((s) => s.unreadCount)
  const fetchNotifications = useNotificationsStore((s) => s.fetch)
  const markRead = useNotificationsStore((s) => s.markRead)
  const markAllRead = useNotificationsStore((s) => s.markAllRead)
  const setSelectedId = useIncidenciasStore((s) => s.setSelectedId)
  const isOnline = useSessionStore((s) => s.status === 'online')

  const loadPage = useCallback(
    (nextPage = 1) => {
      if (!isOnline) return
      return fetchNotifications({ page: nextPage, pageSize })
    },
    [fetchNotifications, isOnline, pageSize]
  )

  useEffect(() => {
    if (!isOnline) return
    loadPage(1)
  }, [isOnline, loadPage, pageSize])

  useEffect(() => {
    if (!isOnline) return
    const timer = window.setInterval(() => loadPage(page), 30_000)
    return () => window.clearInterval(timer)
  }, [isOnline, loadPage, page])

  useEffect(() => {
    if (!open || !isOnline) return
    loadPage(page)
  }, [open, isOnline, loadPage, page, pageSize])

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const openNotification = async (n) => {
    if (isOnline && !n.read) {
      try {
        await markRead(n.id)
      } catch {
        // navigation should proceed even if mark-read fails
      }
    }
    setOpen(false)
    openNotificationLink({ notification: n, navigate, setIncidenciaId: setSelectedId })
  }

  const handleMarkAll = async () => {
    if (!isOnline) return
    await markAllRead()
    await loadPage(page)
  }

  const handlePageChange = (nextPage) => {
    loadPage(nextPage)
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-testid="navbar-notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-2 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <DropdownPanel
        open={open}
        anchorRef={anchorRef}
        menuRef={menuRef}
        align="end"
        width={360}
        estimatedHeight={320}
        zIndex={120}
        testId="notifications-panel"
        className="p-0"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="font-heading text-sm font-bold text-slate-900">Notificaciones</p>
          {unreadCount > 0 && isOnline && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              He leído todo
            </button>
          )}
        </div>

        <NotificationList
          items={items}
          onOpen={openNotification}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={handlePageChange}
          compact
        />
      </DropdownPanel>
    </>
  )
}